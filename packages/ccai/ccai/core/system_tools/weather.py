import os
import aiohttp
from ccai.core import context_variables

async def get_weather(city: str) -> str:
    """
    Obtiene el clima actual para una ciudad específica.

    :param city: Ciudad para la que se desea obtener el clima.
    :return: Información del clima.
    """
    #read dummy var from context variables
    dummy_var = context_variables.get("dummy_var")

    return f"El clima en {city} para es soleado con una temperatura de 25 grados."