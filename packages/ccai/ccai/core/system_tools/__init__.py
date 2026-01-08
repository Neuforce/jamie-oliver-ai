from .weather import get_weather

# This registry maps the string IDs from the 'system_tools' database table
# to the actual callable Python functions.
SYSTEM_TOOLS_REGISTRY = {
    'get_weather': get_weather,
} 