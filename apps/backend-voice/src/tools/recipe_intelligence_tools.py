"""
Recipe intelligence tools for Jamie Oliver AI Cooking Assistant.

These tools enable the agent to help with cooking decisions like
ingredient substitutions, recipe scaling, and contextual tips -
making it feel like cooking with a real chef.
"""

import re
from typing import Dict, Any, Optional, List
from fractions import Fraction

from ccai.core.function_manager import FunctionManager
from ccai.core.function_manager.decorators import register_function
from ccai.core.logger import configure_logger
from ccai.core import context_variables

from src.recipe_engine import parse_iso_duration
from src.services.session_service import session_service
from src.observability.tracing import trace_tool_call

logger = configure_logger(__name__)

# Create function manager for intelligence tools
recipe_intelligence_function_manager = FunctionManager()


def _get_session_id() -> Optional[str]:
    """Retrieve the current session_id from context variables."""
    return context_variables.get("session_id")


def _get_recipe_payload(session_id: str) -> Optional[dict]:
    """Get the full recipe payload for a session."""
    return session_service.get_session_recipe_payload(session_id)


# =============================================================================
# COMMON INGREDIENT SUBSTITUTIONS DATABASE
# This provides quick lookups for common swaps. For complex cases, the agent
# should use its reasoning capabilities.
# =============================================================================

COMMON_SUBSTITUTIONS = {
    "butter": [
        {"substitute": "olive oil", "ratio": "3/4 cup oil per 1 cup butter", "notes": "Works great for savory dishes, changes flavor slightly"},
        {"substitute": "coconut oil", "ratio": "1:1", "notes": "Good for baking, adds slight coconut flavor"},
        {"substitute": "margarine", "ratio": "1:1", "notes": "Direct substitute, check for trans fats"},
        {"substitute": "applesauce", "ratio": "1/2 cup per 1 cup butter", "notes": "For baking, reduces fat content"},
    ],
    "eggs": [
        {"substitute": "flax egg", "ratio": "1 tbsp ground flax + 3 tbsp water per egg", "notes": "Let sit 5 min, good for baking"},
        {"substitute": "mashed banana", "ratio": "1/4 cup per egg", "notes": "Adds sweetness, good for baking"},
        {"substitute": "applesauce", "ratio": "1/4 cup per egg", "notes": "Good for moist baked goods"},
        {"substitute": "silken tofu", "ratio": "1/4 cup per egg", "notes": "Blend until smooth, neutral flavor"},
    ],
    "milk": [
        {"substitute": "almond milk", "ratio": "1:1", "notes": "Slightly nutty flavor, works in most recipes"},
        {"substitute": "oat milk", "ratio": "1:1", "notes": "Creamy, great for baking and sauces"},
        {"substitute": "coconut milk", "ratio": "1:1", "notes": "Rich and creamy, adds coconut flavor"},
        {"substitute": "soy milk", "ratio": "1:1", "notes": "Neutral flavor, high protein"},
    ],
    "cream": [
        {"substitute": "coconut cream", "ratio": "1:1", "notes": "Rich and thick, slight coconut taste"},
        {"substitute": "cashew cream", "ratio": "1:1", "notes": "Blend soaked cashews with water"},
        {"substitute": "evaporated milk", "ratio": "1:1", "notes": "Less rich but works in sauces"},
    ],
    "parmesan": [
        {"substitute": "pecorino romano", "ratio": "1:1", "notes": "Sharper flavor, sheep's milk"},
        {"substitute": "nutritional yeast", "ratio": "3 tbsp per 1/4 cup parmesan", "notes": "Vegan option, cheesy flavor"},
        {"substitute": "aged asiago", "ratio": "1:1", "notes": "Similar texture and flavor"},
    ],
    "onion": [
        {"substitute": "shallots", "ratio": "3 shallots per 1 onion", "notes": "Milder, sweeter flavor"},
        {"substitute": "leeks", "ratio": "1 leek per 1 onion", "notes": "Use white and light green parts"},
        {"substitute": "onion powder", "ratio": "1 tbsp per 1 medium onion", "notes": "For convenience, less texture"},
    ],
    "garlic": [
        {"substitute": "garlic powder", "ratio": "1/8 tsp per clove", "notes": "Milder, easier to distribute"},
        {"substitute": "shallots", "ratio": "1/2 shallot per clove", "notes": "Milder garlic-onion flavor"},
    ],
    "wine": [
        {"substitute": "chicken/vegetable broth", "ratio": "1:1", "notes": "Add splash of vinegar for acidity"},
        {"substitute": "grape juice", "ratio": "1:1 with 1 tbsp vinegar", "notes": "For deglazing"},
        {"substitute": "apple cider vinegar", "ratio": "1 tbsp per 1/2 cup wine", "notes": "Dilute with broth"},
    ],
    "sour cream": [
        {"substitute": "greek yogurt", "ratio": "1:1", "notes": "Tangier, higher protein"},
        {"substitute": "cottage cheese", "ratio": "1:1 blended smooth", "notes": "Blend until creamy"},
    ],
    "flour": [
        {"substitute": "almond flour", "ratio": "1:1", "notes": "Gluten-free, denser results"},
        {"substitute": "oat flour", "ratio": "1:1", "notes": "Blend oats to make, slightly sweet"},
        {"substitute": "coconut flour", "ratio": "1/4 cup per 1 cup flour", "notes": "Very absorbent, add more liquid"},
    ],
}


# =============================================================================
# SCALING FACTORS FOR NON-LINEAR INGREDIENTS
# Some ingredients don't scale linearly (seasonings, leaveners, etc.)
# =============================================================================

NON_LINEAR_SCALING = {
    "salt": 0.75,  # Scale at 75% rate
    "pepper": 0.75,
    "spices": 0.8,
    "baking powder": 0.85,
    "baking soda": 0.85,
    "yeast": 0.9,
    "vanilla": 0.8,
    "garlic": 0.85,
    "herbs": 0.8,
}


def _parse_quantity(quantity_str: str) -> float:
    """Parse a quantity string into a float, handling fractions."""
    if not quantity_str:
        return 0.0
    
    quantity_str = quantity_str.strip()
    
    # Handle mixed fractions like "1 1/2"
    parts = quantity_str.split()
    total = 0.0
    
    for part in parts:
        try:
            if '/' in part:
                total += float(Fraction(part))
            else:
                total += float(part)
        except (ValueError, ZeroDivisionError):
            continue
    
    return total


def _format_quantity(value: float) -> str:
    """Format a quantity nicely, using fractions where appropriate."""
    if value == 0:
        return "0"
    
    # Common cooking fractions
    fractions = {
        0.125: "1/8",
        0.25: "1/4",
        0.333: "1/3",
        0.375: "3/8",
        0.5: "1/2",
        0.625: "5/8",
        0.666: "2/3",
        0.75: "3/4",
        0.875: "7/8",
    }
    
    whole = int(value)
    frac = value - whole
    
    # Find closest fraction
    closest_frac = ""
    min_diff = 0.1
    for f_val, f_str in fractions.items():
        if abs(frac - f_val) < min_diff:
            min_diff = abs(frac - f_val)
            closest_frac = f_str
    
    if whole > 0 and closest_frac:
        return f"{whole} {closest_frac}"
    elif closest_frac:
        return closest_frac
    elif whole > 0:
        return str(whole)
    else:
        return f"{value:.1f}".rstrip('0').rstrip('.')


# =============================================================================
# INTELLIGENCE TOOLS
# =============================================================================

@register_function(recipe_intelligence_function_manager)
@trace_tool_call("suggest_substitution")
async def suggest_substitution(
    ingredient: str,
    available_alternative: str = "",
    dietary_restriction: str = ""
) -> str:
    """
    Suggest substitutions for an ingredient the user doesn't have.
    
    Use this when the user asks:
    - "I don't have butter, what can I use?"
    - "Can I substitute almond milk for regular milk?"
    - "I'm vegan, what can I use instead of eggs?"
    
    Args:
        ingredient: The ingredient the user needs to substitute
        available_alternative: Optional - what the user has available
        dietary_restriction: Optional - vegan, dairy-free, gluten-free, etc.
    
    Returns:
        Substitution suggestions with ratios and tips
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    ingredient_lower = ingredient.lower().strip()
    
    # Find the ingredient in the recipe
    recipe_ingredients = payload.get("ingredients", [])
    recipe_ingredient = None
    
    for ing in recipe_ingredients:
        if isinstance(ing, dict):
            name = ing.get("name", "").lower()
            if ingredient_lower in name or name in ingredient_lower:
                recipe_ingredient = ing
                break
        elif isinstance(ing, str) and ingredient_lower in ing.lower():
            recipe_ingredient = {"name": ing, "quantity": "", "unit": ""}
    
    # Build response
    lines = []
    
    if recipe_ingredient:
        name = recipe_ingredient.get("name", ingredient)
        quantity = recipe_ingredient.get("quantity", "")
        unit = recipe_ingredient.get("unit", "")
        if quantity:
            lines.append(f"You need {quantity} {unit} {name} for this recipe.")
        else:
            lines.append(f"This recipe uses {name}.")
    
    # Check our substitution database
    subs = COMMON_SUBSTITUTIONS.get(ingredient_lower, [])
    
    if available_alternative:
        # User specified what they have - check if it's a valid substitute
        alt_lower = available_alternative.lower().strip()
        matching_sub = None
        for sub in subs:
            if alt_lower in sub["substitute"].lower():
                matching_sub = sub
                break
        
        if matching_sub:
            lines.append(f"\nYes! You can use {matching_sub['substitute']}:")
            lines.append(f"  Ratio: {matching_sub['ratio']}")
            lines.append(f"  Note: {matching_sub['notes']}")
        else:
            lines.append(f"\n{available_alternative.title()} isn't a common substitute for {ingredient}.")
            lines.append("But it might work depending on the recipe - use your judgment!")
            if subs:
                lines.append(f"\nCommon substitutes for {ingredient}:")
                for sub in subs[:3]:
                    lines.append(f"  - {sub['substitute']}: {sub['ratio']}")
    
    elif subs:
        # Show available substitutes
        lines.append(f"\nSubstitutes for {ingredient}:")
        for sub in subs:
            lines.append(f"  - {sub['substitute']}")
            lines.append(f"    Ratio: {sub['ratio']}")
            lines.append(f"    {sub['notes']}")
    else:
        # No known substitutes - provide guidance
        lines.append(f"\nI don't have specific substitutes for {ingredient} in my database.")
        lines.append("Consider what role it plays in the recipe (flavor, texture, binding)")
        lines.append("and find something with similar properties.")
    
    if dietary_restriction:
        lines.append(f"\n(Looking for {dietary_restriction} options)")
    
    return "\n".join(lines)


@register_function(recipe_intelligence_function_manager)
@trace_tool_call("scale_recipe")
async def scale_recipe(target_servings: int) -> str:
    """
    Scale the recipe to a different number of servings.
    
    Use this when the user asks:
    - "Scale this for 8 people"
    - "I need to make this for 2 instead of 4"
    - "Double the recipe"
    
    Args:
        target_servings: The desired number of servings
    
    Returns:
        Scaled ingredient list with adjusted quantities
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    recipe_data = payload.get("recipe", {})
    original_servings = recipe_data.get("servings", 4)
    
    # Parse original servings if it's a string
    if isinstance(original_servings, str):
        # Handle "4-6" format
        if '-' in original_servings:
            original_servings = int(original_servings.split('-')[0])
        else:
            try:
                original_servings = int(original_servings)
            except ValueError:
                original_servings = 4
    
    if target_servings <= 0:
        return "[ERROR] Please specify a positive number of servings."
    
    scale_factor = target_servings / original_servings
    
    ingredients = payload.get("ingredients", [])
    if not ingredients:
        return "[INFO] No ingredients found to scale."
    
    lines = [
        f"Scaling recipe from {original_servings} to {target_servings} servings",
        f"(Scale factor: {scale_factor:.2f}x)",
        "",
        "Scaled ingredients:"
    ]
    
    for ing in ingredients:
        if isinstance(ing, dict):
            name = ing.get("name", "")
            quantity = ing.get("quantity", "")
            unit = ing.get("unit", "")
            
            if quantity:
                original_qty = _parse_quantity(str(quantity))
                
                # Apply non-linear scaling for certain ingredients
                actual_scale = scale_factor
                name_lower = name.lower()
                for key, factor in NON_LINEAR_SCALING.items():
                    if key in name_lower:
                        # Blend toward 1 based on factor
                        actual_scale = 1 + (scale_factor - 1) * factor
                        break
                
                scaled_qty = original_qty * actual_scale
                formatted_qty = _format_quantity(scaled_qty)
                
                if unit:
                    lines.append(f"  - {formatted_qty} {unit} {name}")
                else:
                    lines.append(f"  - {formatted_qty} {name}")
            else:
                lines.append(f"  - {name} (adjust to taste)")
        elif isinstance(ing, str):
            lines.append(f"  - {ing}")
    
    lines.append("")
    lines.append("Note: Cooking times generally stay the same, but keep an eye on things!")
    if scale_factor > 1.5:
        lines.append("Tip: You may need to cook in batches or use larger cookware.")
    elif scale_factor < 0.75:
        lines.append("Tip: Reduce cooking time slightly and watch for doneness.")
    
    return "\n".join(lines)


@register_function(recipe_intelligence_function_manager)
@trace_tool_call("get_cooking_tip")
async def get_cooking_tip(context: str = "") -> str:
    """
    Get a contextual cooking tip based on what the user is doing.
    
    Use this when the user asks:
    - "Any tips for this?"
    - "How do I know when it's done?"
    - "What should I watch out for?"
    
    Args:
        context: Optional context about what step or technique they're asking about
    
    Returns:
        Relevant cooking tip or guidance
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    # Get recipe notes
    notes = payload.get("notes", {})
    tips_from_recipe = []
    
    if isinstance(notes, dict):
        if notes.get("tips"):
            tips_from_recipe.append(notes["tips"])
        if notes.get("text"):
            tips_from_recipe.append(notes["text"])
    elif isinstance(notes, str):
        tips_from_recipe.append(notes)
    
    # Check context against step on_enter messages
    steps = payload.get("steps", [])
    context_tips = []
    
    if context:
        context_lower = context.lower()
        for step in steps:
            descr = step.get("descr", "").lower()
            if context_lower in descr or any(word in descr for word in context_lower.split()):
                for action in step.get("on_enter", []):
                    if "say" in action:
                        context_tips.append(action["say"])
    
    # Build response
    lines = []
    
    if context_tips:
        lines.append("Here's what to know about that:")
        lines.extend([f"  {tip}" for tip in context_tips[:2]])
    
    if tips_from_recipe:
        if lines:
            lines.append("")
        lines.append("Recipe tips:")
        for tip in tips_from_recipe[:2]:
            # Truncate long tips
            if len(tip) > 200:
                tip = tip[:200] + "..."
            lines.append(f"  {tip}")
    
    if not lines:
        # Generic response - agent can use its knowledge
        return "[INFO] No specific tips in the recipe. Ask me about specific techniques or ingredients!"
    
    return "\n".join(lines)


@register_function(recipe_intelligence_function_manager)
@trace_tool_call("get_nutrition_info")
async def get_nutrition_info() -> str:
    """
    Get nutritional information for the recipe if available.
    
    Use this when the user asks:
    - "How many calories is this?"
    - "Is this healthy?"
    - "What's the nutrition info?"
    
    Returns:
        Nutritional information if available
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No active session. Please start cooking first."
    
    payload = _get_recipe_payload(session_id)
    if not payload:
        return "[ERROR] No recipe loaded. Please select a recipe first."
    
    recipe_data = payload.get("recipe", {})
    nutrition = recipe_data.get("nutrition", {})
    
    if not nutrition:
        return "[INFO] No nutritional information available for this recipe."
    
    lines = ["Nutrition (per serving):"]
    
    if nutrition.get("calories"):
        lines.append(f"  Calories: {nutrition['calories']}")
    if nutrition.get("protein"):
        lines.append(f"  Protein: {nutrition['protein']}")
    if nutrition.get("carbohydrates"):
        lines.append(f"  Carbs: {nutrition['carbohydrates']}")
    if nutrition.get("fat"):
        lines.append(f"  Fat: {nutrition['fat']}")
    if nutrition.get("fiber"):
        lines.append(f"  Fiber: {nutrition['fiber']}")
    if nutrition.get("sodium"):
        lines.append(f"  Sodium: {nutrition['sodium']}")
    
    return "\n".join(lines) if len(lines) > 1 else "[INFO] No detailed nutritional information available."
