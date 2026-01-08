# function_manager/decorators.py

from typing import Callable
from ccai.core.function_manager.base import BaseFunctionManager


def register_function(function_manager: BaseFunctionManager):
    def decorator(func: Callable):
        function_manager.register_function(func)
        return func

    return decorator
