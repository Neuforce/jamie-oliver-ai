"""
Discovery tools for the Jamie Oliver chat agent.

These tools allow the agent to search recipes, suggest based on mood,
plan meals, and create shopping lists.
"""

import logging
from typing import List, Optional, Dict, Any

from ccai.core.function_manager.function_manager import FunctionManager

logger = logging.getLogger(__name__)

# Create a function manager for discovery tools
discovery_function_manager = FunctionManager()

# Global reference to search agent (set by chat_agent.py at startup)
_search_agent = None


def set_search_agent(agent) -> None:
    """Set the search agent reference for tools to use."""
    global _search_agent
    _search_agent = agent


def get_search_agent():
    """Get the search agent instance."""
    if _search_agent is None:
        raise RuntimeError("Search agent not initialized. Call set_search_agent() first.")
    return _search_agent


# =============================================================================
# RECIPE SEARCH TOOLS
# =============================================================================

def search_recipes(
    query: str,
    course: str = "",
    cuisine: str = "",
    max_results: int = 5,
) -> str:
    """
    Search for recipes using semantic search based on the user's request.
    
    Use this tool when the user asks for recipe recommendations, wants to find
    something specific, or describes what they're looking for.
    
    IMPORTANT: Use the 'course' filter to ensure you return the right type of dish:
    - For appetizers/starters: course="appetizer"
    - For main dishes: course="main"
    - For desserts/sweets: course="dessert"
    - For soups: course="soup"
    - For salads: course="salad"
    - For sides: course="side"
    - For breakfast: course="breakfast"
    
    Args:
        query: Natural language search query describing what the user wants to cook
        course: Filter by course type (main, dessert, breakfast, soup, salad, side, appetizer). Leave empty for all.
        cuisine: Filter by cuisine type (italian, mexican, japanese, british, etc). Leave empty for all.
        max_results: Maximum number of recipes to return (default 5)
    
    Returns:
        JSON string with matching recipes including title, description, and key details
    """
    import json
    from recipe_search_agent.search import SearchFilters
    
    agent = get_search_agent()
    
    # Build filters - course maps to category in the search system
    filters = SearchFilters(
        category=course if course else None,
    )
    
    # Build enhanced query if cuisine is specified
    search_query = query
    if cuisine:
        search_query = f"{cuisine} {query}"
    
    results = agent.search(
        query=search_query,
        filters=filters,
        top_k=max_results,
        include_full_recipe=True,
        include_chunks=False,
        similarity_threshold=0.3,
    )
    
    def _matches_cuisine(match, cuisine_value: str) -> bool:
        if not cuisine_value:
            return True
        cuisine_key = cuisine_value.lower().strip()
        cuisine_terms = [cuisine_key] + cuisine_key.split()
        cuisine_synonyms = {
            "greek": ["greek", "mediterranean", "feta", "halloumi", "tzatziki", "souvlaki", "gyro", "gyros"],
            "italian": ["italian", "pasta", "risotto", "parmesan", "basil", "oregano"],
            "mexican": ["mexican", "taco", "tacos", "tortilla", "salsa", "cilantro"],
            "japanese": ["japanese", "miso", "soy", "teriyaki", "sushi", "ramen"],
            "british": ["british", "shepherd", "pie", "gravy", "roast"],
        }
        cuisine_terms.extend(cuisine_synonyms.get(cuisine_key, []))

        title = (match.title or "").lower()
        description = ""
        ingredients_text = ""
        if match.full_recipe:
            recipe = match.full_recipe.get("recipe", {})
            description = (recipe.get("description") or "").lower()
            ingredients = match.full_recipe.get("ingredients", [])
            ingredients_text = " ".join((i.get("name", "") for i in ingredients)).lower()

        haystack = " ".join([title, description, ingredients_text])
        return any(term in haystack for term in cuisine_terms)

    if cuisine:
        filtered_results = [match for match in results if _matches_cuisine(match, cuisine)]
        if filtered_results:
            results = filtered_results
        else:
            logger.info(f"No results matched cuisine='{cuisine}'. Returning no results.")
            results = []

    if not results:
        return json.dumps({
            "found": 0,
            "message": "No recipes found matching your search.",
            "recipes": []
        })
    
    # Format results for the agent
    formatted_recipes = []
    for match in results:
        recipe_info = {
            "recipe_id": match.recipe_id,
            "title": match.title,
            "similarity_score": round(match.similarity_score, 2),
        }
        
        # Add details from full recipe if available
        if match.full_recipe:
            recipe = match.full_recipe.get("recipe", {})
            recipe_info["description"] = recipe.get("description", "")
            recipe_info["servings"] = recipe.get("servings")
            recipe_info["estimated_time"] = recipe.get("estimated_total", "")
            recipe_info["difficulty"] = recipe.get("difficulty", "")
            
            # Count steps and ingredients
            ingredients = match.full_recipe.get("ingredients", [])
            steps = match.full_recipe.get("steps", [])
            recipe_info["ingredient_count"] = len(ingredients)
            recipe_info["step_count"] = len(steps)
        
        formatted_recipes.append(recipe_info)
    
    return json.dumps({
        "found": len(formatted_recipes),
        "recipes": formatted_recipes
    }, indent=2)


def get_recipe_details(recipe_id: str) -> str:
    """
    Get full details about a specific recipe.
    
    Use this when the user wants more information about a particular recipe,
    or when you need to provide detailed ingredient lists or instructions.
    
    Args:
        recipe_id: The unique identifier (slug) of the recipe
    
    Returns:
        JSON string with complete recipe details including ingredients, steps, and tips
    """
    import json
    
    agent = get_search_agent()
    
    # Query the recipes table
    response = agent.client.table("recipes").select("*").eq("slug", recipe_id).execute()
    
    if not response.data:
        return json.dumps({
            "error": f"Recipe '{recipe_id}' not found",
            "recipe": None
        })
    
    recipe_row = response.data[0]
    recipe_json = recipe_row.get("recipe_json", {})
    recipe = recipe_json.get("recipe", {})
    
    # Format for agent consumption
    details = {
        "recipe_id": recipe_id,
        "title": recipe.get("title", recipe_id),
        "description": recipe.get("description", ""),
        "servings": recipe.get("servings"),
        "estimated_time": recipe.get("estimated_total", ""),
        "difficulty": recipe.get("difficulty", ""),
        "ingredients": [
            f"{ing.get('quantity', '')} {ing.get('unit', '')} {ing.get('name', '')}".strip()
            for ing in recipe_json.get("ingredients", [])
        ],
        "steps": [
            step.get("instructions", step.get("descr", ""))
            for step in recipe_json.get("steps", [])
        ],
        "notes": recipe_json.get("notes", {}).get("text", ""),
    }
    
    return json.dumps({"recipe": details}, indent=2)


def suggest_recipes_for_mood(mood: str) -> str:
    """
    Suggest recipes based on the user's emotional state or situation.
    
    Use this when the user expresses how they're feeling rather than what
    they want to eat. Examples: "I'm exhausted", "celebrating tonight",
    "need a hug", "feeling adventurous".
    
    Args:
        mood: The user's mood or situation (tired, celebrating, comfort, quick, impressive, adventurous, healthy, indulgent)
    
    Returns:
        JSON string with mood-appropriate recipe suggestions and why they fit
    """
    import json
    
    # Map moods to search queries and explanations
    mood_mappings = {
        "tired": {
            "query": "easy quick simple comfort food minimal effort",
            "explanation": "These are simple, comforting recipes that won't take much energy"
        },
        "exhausted": {
            "query": "easy quick simple minimal ingredients one pot",
            "explanation": "Super easy recipes for when you're running on empty"
        },
        "celebrating": {
            "query": "impressive elegant dinner party special occasion",
            "explanation": "Show-stopping recipes perfect for celebrations"
        },
        "comfort": {
            "query": "comfort food hearty warming cozy homestyle",
            "explanation": "Warming, soul-soothing dishes that feel like a hug"
        },
        "quick": {
            "query": "quick easy under 30 minutes fast weeknight",
            "explanation": "Speedy recipes for busy schedules"
        },
        "impressive": {
            "query": "impressive elegant gourmet dinner party wow",
            "explanation": "Recipes that will wow your guests"
        },
        "adventurous": {
            "query": "exotic international unique unusual flavors",
            "explanation": "Exciting recipes to expand your culinary horizons"
        },
        "healthy": {
            "query": "healthy light nutritious salad vegetables lean",
            "explanation": "Nutritious recipes that are good for body and soul"
        },
        "indulgent": {
            "query": "rich decadent indulgent treat dessert comfort",
            "explanation": "Treat yourself! These are worth every calorie"
        },
    }
    
    # Normalize mood
    mood_lower = mood.lower().strip()
    mapping = mood_mappings.get(mood_lower, {
        "query": f"{mood} recipe food",
        "explanation": f"Recipes that match your '{mood}' mood"
    })
    
    # Search with the mood-appropriate query
    results_json = search_recipes(
        query=mapping["query"],
        max_results=5,
    )
    
    results = json.loads(results_json)
    results["mood"] = mood
    results["mood_explanation"] = mapping["explanation"]
    
    return json.dumps(results, indent=2)


# =============================================================================
# MEAL PLANNING TOOLS
# =============================================================================

def plan_meal(
    occasion: str,
    num_people: int,
) -> str:
    """
    Plan a complete meal with multiple dishes for an occasion.
    
    Use this when the user wants help planning a dinner party, special meal,
    or multi-course experience. This will suggest complementary dishes.
    
    Args:
        occasion: The type of occasion (dinner party, date night, family gathering, holiday, casual)
        num_people: Number of people to serve
    
    Returns:
        JSON string with a suggested meal plan including recipes for each course
    """
    import json
    
    # Map occasions to search style keywords
    occasion_styles = {
        "dinner party": "elegant impressive gourmet",
        "date night": "romantic special elegant",
        "family gathering": "hearty comforting family-friendly",
        "holiday": "festive celebration traditional",
        "casual": "relaxed easy simple",
    }
    
    style = occasion_styles.get(occasion.lower(), "delicious")
    
    meal_plan = {
        "occasion": occasion,
        "serves": num_people,
        "courses": {},
        "tips": []
    }
    
    # Define courses with their filters and queries
    course_configs = [
        {
            "name": "starter",
            "course_filter": "appetizer",  # Filter by appetizer course
            "query": f"{style} appetizer starter",
            "fallback_course": "salad",  # Try salads as starters if no appetizers
        },
        {
            "name": "main",
            "course_filter": "main",
            "query": f"{style} main course dinner",
            "fallback_course": None,
        },
        {
            "name": "dessert",
            "course_filter": "dessert",
            "query": f"{style} dessert sweet treat",
            "fallback_course": None,
        },
    ]
    
    used_recipe_ids = set()  # Track to avoid duplicates
    
    for config in course_configs:
        course_name = config["name"]
        
        # First try with course filter
        results_json = search_recipes(
            query=config["query"],
            course=config["course_filter"],
            max_results=5,  # Get more to filter out duplicates
        )
        results = json.loads(results_json)
        
        # If no results with primary filter, try fallback
        if not results.get("recipes") and config.get("fallback_course"):
            results_json = search_recipes(
                query=config["query"],
                course=config["fallback_course"],
                max_results=5,
            )
            results = json.loads(results_json)
        
        # Filter out duplicates and take top 3
        unique_recipes = []
        for recipe in results.get("recipes", []):
            recipe_id = recipe.get("recipe_id")
            if recipe_id not in used_recipe_ids:
                used_recipe_ids.add(recipe_id)
                unique_recipes.append(recipe)
                if len(unique_recipes) >= 3:
                    break
        
        if unique_recipes:
            meal_plan["courses"][course_name] = unique_recipes
    
    # Add helpful tips based on occasion
    meal_plan["tips"] = [
        f"For {num_people} people, consider scaling recipes accordingly",
        "Prep what you can ahead of time to enjoy the occasion",
        "Consider dietary restrictions when making final selections",
    ]
    
    if occasion.lower() == "dinner party":
        meal_plan["tips"].append("Choose dishes that can be partially prepared ahead")
    elif occasion.lower() == "family gathering":
        meal_plan["tips"].append("Pick crowd-pleasers that work for all ages")
    
    return json.dumps(meal_plan, indent=2)


def create_shopping_list(recipe_ids_csv: str) -> str:
    """
    Generate a consolidated shopping list from selected recipes.
    
    Use this when the user has decided on recipes and wants to know what
    to buy. This combines ingredients from multiple recipes and groups them.
    
    Args:
        recipe_ids_csv: Comma-separated list of recipe IDs (slugs) to include in the shopping list
    
    Returns:
        JSON string with organized shopping list grouped by category
    """
    import json
    from collections import defaultdict
    
    agent = get_search_agent()
    
    # Parse comma-separated recipe IDs
    recipe_ids = [rid.strip() for rid in recipe_ids_csv.split(',') if rid.strip()]
    
    all_ingredients = []
    recipe_names = []
    
    for recipe_id in recipe_ids:
        response = agent.client.table("recipes").select("recipe_json").eq("slug", recipe_id).execute()
        
        if response.data:
            recipe_json = response.data[0].get("recipe_json", {})
            recipe_title = recipe_json.get("recipe", {}).get("title", recipe_id)
            recipe_names.append(recipe_title)
            
            for ing in recipe_json.get("ingredients", []):
                all_ingredients.append({
                    "name": ing.get("name", ""),
                    "quantity": ing.get("quantity"),
                    "unit": ing.get("unit", ""),
                    "from_recipe": recipe_title,
                })
    
    # Group by ingredient name (simple consolidation)
    grouped = defaultdict(list)
    for ing in all_ingredients:
        name = ing["name"].lower().strip()
        grouped[name].append(ing)
    
    # Format shopping list
    shopping_list = []
    for name, items in sorted(grouped.items()):
        if len(items) == 1:
            item = items[0]
            qty_str = f"{item['quantity']} {item['unit']}".strip() if item['quantity'] else ""
            shopping_list.append({
                "item": name.title(),
                "quantity": qty_str,
                "notes": f"for {item['from_recipe']}"
            })
        else:
            # Multiple recipes need this ingredient
            details = [f"{i['quantity']} {i['unit']} for {i['from_recipe']}".strip() for i in items]
            shopping_list.append({
                "item": name.title(),
                "quantity": "multiple",
                "notes": "; ".join(details)
            })
    
    return json.dumps({
        "recipes_included": recipe_names,
        "total_items": len(shopping_list),
        "shopping_list": shopping_list
    }, indent=2)


# =============================================================================
# REGISTER ALL TOOLS
# =============================================================================

# Register all discovery tools with the function manager
discovery_function_manager.register_function(search_recipes)
discovery_function_manager.register_function(get_recipe_details)
discovery_function_manager.register_function(suggest_recipes_for_mood)
discovery_function_manager.register_function(plan_meal)
discovery_function_manager.register_function(create_shopping_list)

logger.info(f"Registered {len(discovery_function_manager.registered_functions)} discovery tools")
