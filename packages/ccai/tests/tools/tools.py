import dotenv
dotenv.load_dotenv()

import os


from ccai.core.function_manager.decorators import register_function
from ccai.core.function_manager import FunctionManager
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import requests
from datetime import datetime, timedelta, timezone
from ccai.core.logger import configure_logger
from zoneinfo import ZoneInfo 

logger = configure_logger(__name__)


function_manager = FunctionManager()




from mailjet_rest import Client
import asyncio




# @register_function(function_manager)
# async def get_weather(
#     ciudad: str,
# ) -> str:
#     """
#     Return (stub) current weather for a city.

#     :param ciudad: City name.
#     :return: Weather description string.
#     """
#     return f"The weather in {ciudad} is sunny with a temperature of 25 degrees."


# @register_function(function_manager)
# async def get_population(
#     ciudad: str,
# ) -> str:
#     """
#     Return (stub) population for a city.

#     :param ciudad: City name.
#     :return: Population description string.
#     """
#     return f"The population of {ciudad} is about 3 million."


LOCAL_TZ = ZoneInfo("America/Vancouver")  # Victoria, BC
UTC_TZ   = timezone.utc  

@register_function(function_manager)
async def get_available_time_slots(
    start_date: str,
    end_date: str,
    meeting_type: str = "15 minutes meeting"
) -> str:
    """
    Retrieves up-to-date free slots from Calendly for a given event type.

    :param start_date: Start date (YYYY-MM-DD, inclusive, >= today).
    :param end_date: End date (YYYY-MM-DD, inclusive, > start_date).
    :param meeting_type: Human-readable event type alias
                         Literal["15 minutes meeting","30 Minute Meeting"].

    :raises ValueError: Invalid date format, range >30 days,
                        or unknown meeting_type.
    :raises ConnectionError: Network or Calendly authentication issues.
    :return: String with the first 10 free slots or an error message.
    """
    import os, asyncio, aiohttp
    from datetime import datetime, timedelta

    # ---------- 0. Guard clauses & helpers ----------
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)
        end_dt   = datetime.strptime(end_date,   "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)
    except ValueError:
        raise ValueError("Use YYYY-MM-DD for start_date and end_date")


    # 1. “Start today ⇒ now + 5 min” rule (still in local zone)
    now_local = datetime.now(LOCAL_TZ)
    if start_dt.date() == now_local.date():
        start_dt = now_local + timedelta(minutes=5)
    
    logger.info(f"debuggeo start_dt {start_dt}")
    logger.info(f"debuggeo end_dt {end_dt}")

    if end_dt <= start_dt:
        raise ValueError("end_date must be after start_date")
    if (end_dt - start_dt).days > 30:
        raise ValueError("Maximum allowed range is 30 days")
    if start_dt.date() < datetime.utcnow().date():
        raise ValueError("start_date cannot be in the past")

    token = os.getenv("CALENDLY_ACCESS_TOKEN")
    if not token:
        raise ConnectionError("CALENDLY_ACCESS_TOKEN is not set")

    headers = {"Authorization": f"Bearer {token}"}

    async with aiohttp.ClientSession(headers=headers) as session:
        # ---------- 1. Resolve meeting_type → event_type_uri ----------
        async with session.get("https://api.calendly.com/event_types",
                               params={"user": "https://api.calendly.com/users/cf12492f-545c-4788-9b25-94f3a8b78fa6"}) as r:
            if r.status != 200:
                error = await r.text()
                logger.info(f"debuggeo event_types fallo {r.status} {error}")
                raise ConnectionError(f"event_types failed {r.status} {error}")
            data = await r.json()

        

        for event_type in data["collection"]:
            if event_type["name"].lower() == meeting_type.lower():
                event_type_uri = event_type["uri"]
                break

        if not event_type_uri:
            raise ValueError(
                f"meeting_type '{meeting_type}' not found. Available types: "
                f"{', '.join([et['name'] for et in data['collection']])}"
            )


        # ---------- 2. Loop over ≤7-day slices ----------
        slots, cursor = [], start_dt
        while cursor <= end_dt:
            slice_start = cursor
            slice_end   = min(cursor + timedelta(days=6), end_dt)
            params = {
                "event_type": event_type_uri,
                "start_time": slice_start.astimezone(UTC_TZ).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end_time":   slice_end.strftime("%Y-%m-%dT23:59:59Z")
            }
            logger.info(f"debuggeo params {params}")
            async with session.get(
                    "https://api.calendly.com/event_type_available_times",
                    params=params) as r:
                if r.status != 200:
                    error = await r.text()
                    logger.info(f"debuggeo available_times fallo {r.status} {error}")
                    raise ConnectionError(f"available_times failed {r.status}")
                times = await r.json()

            for item in times.get("collection", []):
                slots.append(item["start_time"])
            cursor = slice_end + timedelta(days=1)

    # ---------- 3. Format & return ----------
    if not slots:
        return (
            "No availability between "
            f"{start_dt:%m/%d/%Y} and {end_dt:%m/%d/%Y}."
        )

    # Sort, dedupe, limit
    unique_slots = sorted(set(slots))
    readable = [
        datetime.fromisoformat(s.rstrip("Z"))
        .strftime("%A, %B %d at %I:%M %p")
        for s in unique_slots
    ][:10]

    extra = len(unique_slots) - len(readable)
    tail  = f" ({extra} more…)" if extra else ""
    return "Available times: " + ", ".join(readable) + tail



ALEXIS_EMAIL = "alexis@open-works.ca"
ALEXIS_NAME  = "Alexis"

@register_function(function_manager)
async def notify_meeting_request(
    requester_name: str,
    requester_email: str,
    meeting_topic: str,
    preferred_slot_local: str,
    details: str = None
) -> str:
    """
    Send an email alert with the meeting request to the configured recipients.

    :param requester_name: Name of the person requesting the meeting.
    :param requester_email: Requester email address.
    :param meeting_topic: Meeting topic or type (free text).
    :param preferred_slot_local: Preferred local date-time in **America/Vancouver**
                                 as 'YYYY-MM-DD HH:MM'.
    :param details: Optional notes from the requester.

    :return: Success message or raises on failure.
    """
    api_key = os.getenv("MAILJET_API_KEY")
    api_secret = os.getenv("MAILJET_SECRET")
    if not api_key or not api_secret:
        raise ConnectionError("MAILJET_API_KEY/MAILJET_SECRET are not configured")

    # 1· Build the Mailjet payload ------------------------------------------------
    msg_datetime = datetime.now(ZoneInfo("America/Vancouver")).strftime("%Y-%m-%d %H:%M")
    html = f"""
    <h3>New meeting request</h3>
    <p><strong>Requester:</strong> {requester_name} ({requester_email})</p>
    <p><strong>Topic:</strong> {meeting_topic}</p>
    <p><strong>Preferred time:</strong> {preferred_slot_local} (America/Vancouver)</p>
    <p><strong>Additional details:</strong><br/>{details or '–'}</p>
    <hr>
    <em>Sent automatically on {msg_datetime}</em>
    """

    data = {
        "Messages": [{
            "From": {"Email": "santiago.m@open-works.co", "Name": "Santi (bot)"},
            "To":   [{"Email": ALEXIS_EMAIL, "Name": ALEXIS_NAME}],
            "Subject": f"Meeting request: {meeting_topic}",
            "TextPart": (
                f"Requester: {requester_name} ({requester_email})\n"
                f"Topic: {meeting_topic}\n"
                f"Preferred time: {preferred_slot_local} (America/Vancouver)\n"
                f"Details: {details or '–'}"
            ),
            "HTMLPart": html
        }]
    }

    # 2· Send in a thread so we don't block the event loop ------------------------
    def _send_mail():
        mailjet = Client(auth=(api_key, api_secret), version='v3.1')
        return mailjet.send.create(data=data)

    loop = asyncio.get_running_loop()
    response = await loop.run_in_executor(None, _send_mail)

    if response.status_code == 200:
        logger.info("Mailjet message sent OK: %s", response.json())
        return "Notification sent successfully to Alexis."
    else:
        logger.error("Mailjet error %s: %s", response.status_code, response.text)
        raise ConnectionError(f"Mailjet error {response.status_code}: {response.text}")