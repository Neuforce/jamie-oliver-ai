import os
import aiohttp
from ccai.core import context_variables

async def get_weather(city: str) -> str:
    """
    Return (stub) current weather for a given city.

    :param city: City name.
    :return: Weather description string.
    """
    #read dummy var from context variables
    dummy_var = context_variables.get("dummy_var")

    return f"The weather in {city} is sunny with a temperature of 25 degrees."