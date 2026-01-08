import asyncio
from typing import Callable, Dict, Any

from ccai.core.function_manager.base import BaseFunctionManager
from ccai.core.function_manager.models import RegisteredFunction, FunctionRegistry
from ccai.core.tracing import observe_function_call
from ccai.core import context_variables


class FunctionManager(BaseFunctionManager):
    def __init__(self):
        self.registered_functions: FunctionRegistry = {}

    def register_function(self, func: Callable):
        registered_func = RegisteredFunction.from_function(func)
        self.registered_functions[registered_func.name] = registered_func

    def get_registered_functions(self) -> Dict[str, RegisteredFunction]:
        return self.registered_functions

    async def execute_function(
            self, function_name: str, arguments: Dict[str, Any]
    ) -> str:
        registered_func = self.registered_functions.get(function_name)
        if not registered_func:
            raise ValueError(f"Function '{function_name}' not found.")
        func = registered_func.func

        #test
        
        # Auto-inject session_id from context if the function expects it
        # Always replace whatever the LLM provided with the real session from context
        if 'session_id' in arguments:
            real_session_id = context_variables.get('session_id')
            if real_session_id:
                provided_session = arguments.get('session_id', '')
                if provided_session != real_session_id:
                    # Log the replacement for debugging
                    from ccai.core.logger import configure_logger
                    logger = configure_logger(__name__)
                    logger.info(f"🔄 Replacing LLM session_id '{provided_session}' with real session '{real_session_id}'")
                arguments['session_id'] = real_session_id
        
        # Apply function call tracing dynamically
        traced_func = observe_function_call(function_name)(func)
        
        if asyncio.iscoroutinefunction(func):
            return await traced_func(**arguments)
        else:
            return traced_func(**arguments)
