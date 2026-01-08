import json
import aiohttp
from typing import Dict, Any, Callable, List

from .function_manager import FunctionManager
from ..system_tools import SYSTEM_TOOLS_REGISTRY

class DynamicFunctionManager(FunctionManager):
    """
    Manages functions for a voice assistant by loading tools from a configuration.

    This manager is populated at runtime based on database configurations
    for system and custom tools assigned to a specific assistant.
    """

    def load_tools_from_config(
        self,
        system_tool_ids: List[str],
        custom_tool_configs: List[Dict[str, Any]]
    ):
        """
        Populates the function registry from lists of system and custom tools.

        :param system_tool_ids: A list of IDs for the system tools to register (e.g., ['get_weather']).
        :param custom_tool_configs: A list of configuration objects for custom tools.
        """
        # Register all assigned system tools
        for tool_id in system_tool_ids:
            tool_function = SYSTEM_TOOLS_REGISTRY.get(tool_id)
            if tool_function:
                self.register_function(tool_function)

        # Generate and register all assigned custom tools
        for config in custom_tool_configs:
            custom_function = self._create_custom_api_function(config)
            self.register_function(custom_function)

    def _create_custom_api_function(self, config: Dict[str, Any]) -> Callable:
        """
        Generates a completely self-contained Python function from a custom tool's configuration.
        """
        function_name = config.get('name')
        if not function_name:
            return None

        properties = config.get('properties', [])
        if isinstance(properties, str):
            try:
                properties = json.loads(properties)
            except (json.JSONDecodeError, TypeError):
                properties = []

        # Build the parameter list with types
        type_mapping = {
            'string': 'str',
            'number': 'float', 
            'integer': 'int',
            'boolean': 'bool',
        }

        param_list = []
        for prop in properties:
            param_name = prop.get('name')
            json_type = prop.get('type', 'string')
            python_type = type_mapping.get(json_type, 'str')
            param_list.append(f"{param_name}: {python_type}")
        
        params_string = ", ".join(param_list)

        # Extract config values for embedding in the function
        url = config.get('url', '')
        method = config.get('method', 'POST')
        headers = config.get('headers', {})

        # Create a completely self-contained function
        function_definition = f"""
import aiohttp

async def {function_name}({params_string}) -> str:
    url = "{url}"
    method = "{method}"
    headers = {repr(headers)}
    
    # Collect all parameters into a dictionary
    params_dict = {{{", ".join([f'"{prop.get("name")}": {prop.get("name")}' for prop in properties])}}}
    
    try:
        async with aiohttp.ClientSession() as session:
            if method.upper() == 'GET':
                async with session.get(url, params=params_dict, headers=headers) as response:
                    if response.ok:
                        return await response.text()
                    else:
                        return f"API Error: Status {{response.status}} - {{await response.text()}}"
            else:
                async with session.request(method, url, json=params_dict, headers=headers) as response:
                    if response.ok:
                        return await response.text()
                    else:
                        return f"API Error: Status {{response.status}} - {{await response.text()}}"
    except Exception as e:
        return f"Error calling {function_name}: {{str(e)}}"
"""

        # Execute the function definition
        namespace = {}
        exec(function_definition, namespace)
        created_function = namespace[function_name]

        # Build docstring
        description = config.get('description', 'A custom tool that makes an API request.')
        return_description = config.get('return_description', 'The response from the API.')
        
        docstring_lines = [description, ""]
        for prop in properties:
            docstring_lines.append(f":param {prop.get('name')}: {prop.get('description', '')}")
        docstring_lines.append(f":return: {return_description}")
        
        created_function.__doc__ = "\n".join(docstring_lines)
        
        return created_function 