"""
Recipe context tools for Jamie Oliver AI Cooking Assistant.

These tools give the agent access to recipe knowledge so it can answer
questions about ingredients, quantities, steps, and more - enabling
natural conversations about the recipe being cooked.
"""

import re
from typing import Dict, Any, Optional, List

from ccai.core.function_manager import FunctionManager
from ccai.core.function_manager.decorators import register_function
from ccai.core.logger import configure_logger
from ccai.core import context_variables

from src.recipe_engine import RecipeEngine, parse_iso_duration
from src.services.session_service import session_service
from src.observability.tracing import trace_tool_call

logger = configure_logger(__name__)

# Create function manager for context tools
recipe_context_function_manager = FunctionManager()


def _get_session_id() -> Optional[str]:
    """Retrieve the current session_id from context variables."""
    return context_variables.get("session_id")


def _get_engine(session_id: str) -> Optional[RecipeEngine]:
    """Get the recipe engine for a session."""
    return session_service.get_engine(session_id)


def _get_recipe_payload(session_id: str) -> Optional[dict]:
    """Get the full recipe payload for a session."""
    return session_service.get_session_recipe_payload(session_id)


def _format_duration_natural(iso_duration: str) -> str:
    """Convert ISO duration to natural language."""
    if not iso_duration:
        return "unknown time"
    
    seconds = parse_iso_duration(iso_duration)
    if seconds <= 0:
        return "a moment"
    
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    
    parts = []
    if hours:
        parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
    if minutes:
        parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
    if secs and not hours:  # Only show seconds if no hours
        parts.append(f"{secs} second{'s' if secs != 1 else ''}")
    
    return " and ".join(parts) if len(parts) <= 2 else ", ".join(parts[:-1]) + f", and {parts[-1]}"


# =============================================================================
# RECIPE QUERY TOOLS
# =============================================================================

@register_function(recipe_context_function_manager)
@trace_tool_call("get_recipe_details")
async def get_recipe_details() -> str:
    """
    Get full details about the current recipe including title, servings,
    total time, difficulty, and description.
    
    Use this when the user asks general questions like:
    - "Tell me about this recipe"
    - "How long does this take?"
    - "How many servings?"
    
    Returns:
        Recipe overview with key metadata
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    recipe_data = payload.get("recipe", {})
    
    title = recipe_data.get("title", "Unknown Recipe")
    servings = recipe_data.get("servings", "Unknown")
    description = recipe_data.get("description", "")
    difficulty = recipe_data.get("difficulty", "medium")
    
    # Get timing information
    prep_time = recipe_data.get("prep_time", "")
    cook_time = recipe_data.get("cook_time", "")
    total_time = recipe_data.get("estimated_total", "")
    
    # Format response
    details = [f"Recipe: {title}"]
    details.append(f"Servings: {servings}")
    
    if total_time:
        details.append(f"Total time: {_format_duration_natural(total_time)}")
    if prep_time:
        details.append(f"Prep time: {_format_duration_natural(prep_time)}")
    if cook_time:
        details.append(f"Cook time: {_format_duration_natural(cook_time)}")
    
    details.append(f"Difficulty: {difficulty}")
    
    if description:
        details.append(f"Description: {description}")
    
    # Count steps
    steps = payload.get("steps", [])
    details.append(f"Steps: {len(steps)}")
    
    return "\n".join(details)


@register_function(recipe_context_function_manager)
@trace_tool_call("get_ingredients")
async def get_ingredients() -> str:
    """
    Get the full list of ingredients with quantities for the current recipe.
    
    Use this when the user asks:
    - "What ingredients do I need?"
    - "Read me the ingredient list"
    - "What do I need for this recipe?"
    
    Returns:
        Complete ingredient list with quantities
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    ingredients = payload.get("ingredients", [])
    if not ingredients:
        return "[INFO] No ingredients found in recipe data."
    
    # Format ingredients
    lines = ["Ingredients:"]
    for ing in ingredients:
        if isinstance(ing, dict):
            name = ing.get("name", "")
            quantity = ing.get("quantity", "")
            unit = ing.get("unit", "")
            notes = ing.get("notes", "")
            
            # Build ingredient line
            if quantity and unit:
                line = f"- {quantity} {unit} {name}"
            elif quantity:
                line = f"- {quantity} {name}"
            else:
                line = f"- {name}"
            
            if notes:
                line += f" ({notes})"
            
            lines.append(line)
        elif isinstance(ing, str):
            lines.append(f"- {ing}")
    
    return "\n".join(lines)


@register_function(recipe_context_function_manager)
@trace_tool_call("get_ingredient_info")
async def get_ingredient_info(ingredient_name: str) -> str:
    """
    Get details about a specific ingredient including quantity and any notes.
    
    Use this when the user asks about a specific ingredient:
    - "How much butter do I need?"
    - "What about the garlic?"
    - "How many eggs?"
    
    Args:
        ingredient_name: The name of the ingredient to look up (partial match works)
    
    Returns:
        Details about the specific ingredient or similar matches
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    ingredients = payload.get("ingredients", [])
    if not ingredients:
        return "[INFO] No ingredients found in recipe data."
    
    # Normalize search term
    search = ingredient_name.lower().strip()
    
    # Find matches
    exact_matches = []
    partial_matches = []
    
    for ing in ingredients:
        if isinstance(ing, dict):
            name = ing.get("name", "").lower()
            
            if search == name or search in name.split():
                exact_matches.append(ing)
            elif search in name:
                partial_matches.append(ing)
        elif isinstance(ing, str):
            if search in ing.lower():
                partial_matches.append({"name": ing, "quantity": "", "unit": ""})
    
    # Format response
    matches = exact_matches or partial_matches
    
    if not matches:
        return f"[INFO] No ingredient matching '{ingredient_name}' found. Use get_ingredients() to see the full list."
    
    if len(matches) == 1:
        ing = matches[0]
        name = ing.get("name", "")
        quantity = ing.get("quantity", "")
        unit = ing.get("unit", "")
        notes = ing.get("notes", "")
        
        result = f"{name}: "
        if quantity and unit:
            result += f"{quantity} {unit}"
        elif quantity:
            result += quantity
        else:
            result += "amount not specified"
        
        if notes:
            result += f" ({notes})"
        
        return result
    
    # Multiple matches
    lines = [f"Found {len(matches)} ingredients matching '{ingredient_name}':"]
    for ing in matches:
        name = ing.get("name", "")
        quantity = ing.get("quantity", "")
        unit = ing.get("unit", "")
        
        if quantity and unit:
            lines.append(f"- {name}: {quantity} {unit}")
        elif quantity:
            lines.append(f"- {name}: {quantity}")
        else:
            lines.append(f"- {name}")
    
    return "\n".join(lines)


@register_function(recipe_context_function_manager)
@trace_tool_call("get_step_details")
async def get_step_details(step_id: str = "", step_number: int = 0) -> str:
    """
    Get detailed information about a specific step.
    
    Use this when the user asks about a particular step:
    - "Tell me more about this step"
    - "What exactly do I do in step 3?"
    - "Explain the roasting step"
    
    Args:
        step_id: The step ID (e.g., "roast_squash")
        step_number: Alternatively, the step number (1-based, e.g., 3 for step 3)
    
    Returns:
        Detailed step information including instructions and timing
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    engine = _get_engine(session_id)
    payload = _get_recipe_payload(session_id)
    
    if not engine or not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    steps = payload.get("steps", [])
    target_step = None
    
    # Find step by ID
    if step_id:
        for step in steps:
            if step.get("id") == step_id:
                target_step = step
                break
    
    # Find step by number (1-based)
    if not target_step and step_number > 0:
        if 0 < step_number <= len(steps):
            target_step = steps[step_number - 1]
    
    # If no specific step requested, show current step
    if not target_step:
        state = engine.get_state()
        active_steps = [s for s in state.get("steps", {}).values() if s.get("status") == "active"]
        if active_steps:
            current_id = active_steps[0].get("id")
            for step in steps:
                if step.get("id") == current_id:
                    target_step = step
                    break
    
    if not target_step:
        return "[INFO] Could not find the specified step. Try using get_current_step() or specify a step number."
    
    # Format step details
    step_id = target_step.get("id", "unknown")
    descr = target_step.get("descr", "")
    instructions = target_step.get("instructions", descr)
    step_type = target_step.get("type", "immediate")
    duration = target_step.get("duration", "")
    
    lines = [f"Step: {descr}"]
    
    if instructions and instructions != descr:
        lines.append(f"Instructions: {instructions}")
    
    if step_type == "timer" and duration:
        lines.append(f"Duration: {_format_duration_natural(duration)}")
    
    # Check for on_enter messages (tips/guidance)
    on_enter = target_step.get("on_enter", [])
    for action in on_enter:
        if "say" in action:
            lines.append(f"Guidance: {action['say']}")
    
    # Add notes if present
    notes = target_step.get("notes", "")
    if notes:
        lines.append(f"Notes: {notes}")
    
    return "\n".join(lines)


@register_function(recipe_context_function_manager)
@trace_tool_call("search_recipe_content")
async def search_recipe_content(query: str) -> str:
    """
    Search across the recipe for mentions of a specific ingredient, technique, or term.
    
    Use this when the user asks:
    - "When do I add the garlic?"
    - "Which step uses the butter?"
    - "Where do I need the oven?"
    
    Args:
        query: The search term to find in the recipe
    
    Returns:
        Steps and ingredients that mention the search term
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    query_lower = query.lower().strip()
    results = []
    
    # Search in steps
    steps = payload.get("steps", [])
    for i, step in enumerate(steps):
        step_text = ""
        step_text += step.get("descr", "") + " "
        step_text += step.get("instructions", "") + " "
        
        # Check on_enter messages
        for action in step.get("on_enter", []):
            if "say" in action:
                step_text += action["say"] + " "
        
        if query_lower in step_text.lower():
            step_id = step.get("id", f"step_{i+1}")
            descr = step.get("descr", "")
            results.append(f"Step {i+1} ({step_id}): {descr}")
    
    # Search in ingredients
    ingredients = payload.get("ingredients", [])
    matching_ingredients = []
    for ing in ingredients:
        if isinstance(ing, dict):
            name = ing.get("name", "")
            notes = ing.get("notes", "")
            if query_lower in name.lower() or query_lower in notes.lower():
                quantity = ing.get("quantity", "")
                unit = ing.get("unit", "")
                if quantity and unit:
                    matching_ingredients.append(f"{quantity} {unit} {name}")
                elif quantity:
                    matching_ingredients.append(f"{quantity} {name}")
                else:
                    matching_ingredients.append(name)
        elif isinstance(ing, str) and query_lower in ing.lower():
            matching_ingredients.append(ing)
    
    # Format response
    response_parts = []
    
    if results:
        response_parts.append(f"Found '{query}' in these steps:")
        response_parts.extend([f"  {r}" for r in results])
    
    if matching_ingredients:
        if response_parts:
            response_parts.append("")
        response_parts.append(f"Found '{query}' in ingredients:")
        response_parts.extend([f"  - {ing}" for ing in matching_ingredients])
    
    if not response_parts:
        return f"[INFO] No mentions of '{query}' found in the recipe."
    
    return "\n".join(response_parts)


@register_function(recipe_context_function_manager)
@trace_tool_call("get_utensils")
async def get_utensils() -> str:
    """
    Get the list of utensils and equipment needed for the recipe.
    
    Use this when the user asks:
    - "What equipment do I need?"
    - "What pots and pans should I get out?"
    - "Do I need any special tools?"
    
    Returns:
        List of required utensils and equipment
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    utensils = payload.get("utensils", [])
    if not utensils:
        return "[INFO] No utensils list found in recipe data."
    
    lines = ["Equipment needed:"]
    for utensil in utensils:
        if isinstance(utensil, dict):
            name = utensil.get("name", "")
            notes = utensil.get("notes", "")
            if notes:
                lines.append(f"- {name} ({notes})")
            else:
                lines.append(f"- {name}")
        elif isinstance(utensil, str):
            lines.append(f"- {utensil}")
    
    return "\n".join(lines)


@register_function(recipe_context_function_manager)
@trace_tool_call("get_recipe_notes")
async def get_recipe_notes() -> str:
    """
    Get any additional notes, tips, or serving suggestions for the recipe.
    
    Use this when the user asks:
    - "Any tips for this recipe?"
    - "How should I serve this?"
    - "Any suggestions?"
    
    Returns:
        Recipe notes and tips
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    notes = payload.get("notes", {})
    if not notes:
        return "[INFO] No additional notes found for this recipe."
    
    lines = []
    
    if isinstance(notes, dict):
        if notes.get("text"):
            lines.append(f"Notes: {notes['text']}")
        if notes.get("tips"):
            lines.append(f"Tips: {notes['tips']}")
        if notes.get("serving"):
            lines.append(f"Serving suggestion: {notes['serving']}")
    elif isinstance(notes, str):
        lines.append(f"Notes: {notes}")
    
    return "\n".join(lines) if lines else "[INFO] No additional notes found for this recipe."
