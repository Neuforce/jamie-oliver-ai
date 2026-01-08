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
#     Obtiene el clima actual para una ciudad específica.

#     :param ciudad: Ciudad para la que se desea obtener el clima.
#     :return: Información del clima.
#     """
#     return f"El clima en {ciudad} para es soleado con una temperatura de 25 grados."


# @register_function(function_manager)
# async def get_population(
#     ciudad: str,
# ) -> str:
#     """
#     Obtiene el numero de habitantes de una ciudad específica.

#     :param ciudad: Ciudad para la que se desea obtener la población
#     :return: Información de la población.
#     """
#     return f"La población de {ciudad} es de 3 millones de habitantes."


LOCAL_TZ = ZoneInfo("America/Vancouver")  # Victoria, BC
UTC_TZ   = timezone.utc  

@register_function(function_manager)
async def get_available_time_slots(
    start_date: str,
    end_date: str,
    meeting_type: str = "15 minutes meeting"
) -> str:
    """
    Retrieves up-to-date free slots from Calendly for a given Event Type.

    :param start_date: Fecha inicio (YYYY-MM-DD, inclusive, >= hoy).
    :param end_date:   Fecha fin    (YYYY-MM-DD, inclusive, > start_date).
    :param meeting_type: Alias humano del tipo de reunión
                         Literal["15 minutes meeting","30 Minute Meeting"].

    :raises ValueError: Formato de fecha inválido, rango >30 días
                        o meeting_type desconocido.
    :raises ConnectionError: Problemas de red o autenticación con Calendly.
    :return: Cadena con los 10 primeros horarios libres o mensaje de error.
    """
    import os, asyncio, aiohttp
    from datetime import datetime, timedelta

    # ---------- 0. Guard clauses & helpers ----------
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)
        end_dt   = datetime.strptime(end_date,   "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)
    except ValueError:
        raise ValueError("Use YYYY-MM-DD para start_date y end_date")


    # 1. “Start today ⇒ now + 5 min” rule (still in local zone)
    now_local = datetime.now(LOCAL_TZ)
    if start_dt.date() == now_local.date():
        start_dt = now_local + timedelta(minutes=5)
    
    logger.info(f"debuggeo start_dt {start_dt}")
    logger.info(f"debuggeo end_dt {end_dt}")

    if end_dt <= start_dt:
        raise ValueError("end_date debe ser posterior a start_date")
    if (end_dt - start_dt).days > 30:
        raise ValueError("Rango máximo admitido: 30 días")
    if start_dt.date() < datetime.utcnow().date():
        raise ValueError("start_date no puede estar en el pasado")

    token = os.getenv("CALENDLY_ACCESS_TOKEN")
    if not token:
        raise ConnectionError("Variable CALENDLY_ACCESS_TOKEN no definida")

    headers = {"Authorization": f"Bearer {token}"}

    async with aiohttp.ClientSession(headers=headers) as session:
        # ---------- 1. Resolve meeting_type → event_type_uri ----------
        async with session.get("https://api.calendly.com/event_types",
                               params={"user": "https://api.calendly.com/users/cf12492f-545c-4788-9b25-94f3a8b78fa6"}) as r:
            if r.status != 200:
                error = await r.text()
                logger.info(f"debuggeo event_types fallo {r.status} {error}")
                raise ConnectionError(f"event_types fallo {r.status} {error}")
            data = await r.json()

        

        for event_type in data["collection"]:
            if event_type["name"].lower() == meeting_type.lower():
                event_type_uri = event_type["uri"]
                break

        if not event_type_uri:
            raise ValueError(f"meeting_type '{meeting_type}' no encontrado. Los tipos disponibles son: {', '.join([et['name'] for et in data['collection']])}")


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
                    raise ConnectionError(f"available_times fallo {r.status}")
                times = await r.json()

            for item in times.get("collection", []):
                slots.append(item["start_time"])
            cursor = slice_end + timedelta(days=1)

    # ---------- 3. Format & return ----------
    if not slots:
        return ("No hay disponibilidad entre "
                f"{start_dt:%d/%m/%Y} y {end_dt:%d/%m/%Y}.")

    # Sort, dedupe, limit
    unique_slots = sorted(set(slots))
    readable = [
        datetime.fromisoformat(s.rstrip("Z"))
        .strftime("%A, %B %d at %I:%M %p")
        for s in unique_slots
    ][:10]

    extra = len(unique_slots) - len(readable)
    tail  = f" ({extra} más…)" if extra else ""
    return "Horarios libres: " + ", ".join(readable) + tail



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
    Envía una alerta a con la solicitud de reunión a las personas indicadas.

    :param requester_name: Nombre de quien solicita la reunión.
    :param requester_email: Correo del solicitante.
    :param meeting_topic: Tema o tipo de reunión (texto libre).
    :param preferred_slot_local: Fecha-hora preferida **en zona America/Vancouver**
                                 formato 'YYYY-MM-DD HH:MM'.
    :param details: Información adicional opcional proporcionada por el solicitante.

    :return: Cadena indicando éxito o razón de fallo.
    """
    api_key = os.getenv("MAILJET_API_KEY")
    api_secret = os.getenv("MAILJET_SECRET")
    if not api_key or not api_secret:
        raise ConnectionError("MAILJET_API_KEY/MAILJET_SECRET no configuradas")

    # 1· Build the Mailjet payload ------------------------------------------------
    msg_datetime = datetime.now(ZoneInfo("America/Vancouver")).strftime("%Y-%m-%d %H:%M")
    html = f"""
    <h3>Nueva solicitud de reunión</h3>
    <p><strong>Solicitante:</strong> {requester_name} ({requester_email})</p>
    <p><strong>Tema:</strong> {meeting_topic}</p>
    <p><strong>Horario preferido:</strong> {preferred_slot_local} (America/Vancouver)</p>
    <p><strong>Detalles adicionales:</strong><br/>{details or '–'}</p>
    <hr>
    <em>Enviado automáticamente el {msg_datetime}</em>
    """

    data = {
        "Messages": [{
            "From": {"Email": "santiago.m@open-works.co", "Name": "Santi (bot)"},
            "To":   [{"Email": ALEXIS_EMAIL, "Name": ALEXIS_NAME}],
            "Subject": f"Solicitud de reunión: {meeting_topic}",
            "TextPart": (
                f"Solicitante: {requester_name} ({requester_email})\n"
                f"Tema: {meeting_topic}\n"
                f"Horario preferido: {preferred_slot_local} (America/Vancouver)\n"
                f"Detalles: {details or '–'}"
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
        return "Notificación enviada correctamente a Alexis."
    else:
        logger.error("Mailjet error %s: %s", response.status_code, response.text)
        raise ConnectionError(f"Mailjet error {response.status_code}: {response.text}")