from abc import ABC
from typing import Dict, Any, Callable
from ccai.core.function_manager.models import FunctionRegistry


class BaseFunctionManager(ABC):
    def register_function(self, func: Callable) -> None:
        pass

    def get_registered_functions(self) -> FunctionRegistry:
        pass

    async def execute_function(
            self, function_name: str, arguments: Dict[str, Any]
    ) -> Any:
        pass
