"""
Tools module for Jamie Oliver AI backend.
Contains domain-specific tools like recipe management.

Tool categories:
- recipe_tools: Step management, timers, recipe lifecycle
- recipe_context_tools: Query recipe information (ingredients, steps, etc.)
- recipe_intelligence_tools: Reasoning capabilities (substitutions, scaling, tips)
"""

from .recipe_tools import recipe_function_manager
from .recipe_context_tools import recipe_context_function_manager
from .recipe_intelligence_tools import recipe_intelligence_function_manager


def get_combined_function_manager():
    """
    Get a function manager that combines all recipe-related tools.
    
    This merges tools from:
    - recipe_tools (step management, timers)
    - recipe_context_tools (query capabilities)  
    - recipe_intelligence_tools (reasoning capabilities)
    
    Returns:
        Combined FunctionManager with all tools registered
    """
    # Register context tools into main manager
    for func_name, func_info in recipe_context_function_manager.get_registered_functions().items():
        if func_name not in recipe_function_manager.get_registered_functions():
            recipe_function_manager.registered_functions[func_name] = func_info
    
    # Register intelligence tools into main manager
    for func_name, func_info in recipe_intelligence_function_manager.get_registered_functions().items():
        if func_name not in recipe_function_manager.get_registered_functions():
            recipe_function_manager.registered_functions[func_name] = func_info
    
    return recipe_function_manager


# Initialize combined manager on import
_combined_manager = get_combined_function_manager()

__all__ = [
    "recipe_function_manager",
    "recipe_context_function_manager", 
    "recipe_intelligence_function_manager",
    "get_combined_function_manager",
]

