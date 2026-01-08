"""Semantic analyzer for recipe components."""

from __future__ import annotations

import re
from typing import Any


def analyze_recipe_semantics(joav0_doc: dict[str, Any]) -> dict[str, Any]:
    """
    Analyze JOAv0 document and extract semantic components.
    
    Returns a dict with:
    - main_ingredients: Top ingredients by importance
    - secondary_ingredients: Supporting ingredients
    - techniques: Cooking techniques detected
    - occasions: Inferred occasions (christmas, party, etc.)
    - moods: Inferred moods (fresh, comfort, etc.)
    - dietary_tags: Detected dietary restrictions
    - meal_types: Inferred meal types (lunch, dinner, side, etc.)
    - season: Inferred season
    """
    recipe = joav0_doc["recipe"]
    ingredients = joav0_doc.get("ingredients", [])
    steps = joav0_doc.get("steps", [])
    
    # Extract basic info
    title = recipe.get("title", "").lower()
    difficulty = recipe.get("difficulty", "").lower()
    time_str = recipe.get("estimated_total", "")
    
    # Parse time
    time_minutes = _parse_time_minutes(time_str)
    
    # Analyze ingredients
    main_ings, secondary_ings = _categorize_ingredients(ingredients)
    
    # Detect techniques
    techniques = _detect_techniques(steps)
    
    # Infer occasions
    occasions = _infer_occasions(title, ingredients, steps)
    
    # Infer moods
    moods = _infer_moods(title, ingredients, techniques, time_minutes)
    
    # Detect dietary tags
    dietary_tags = _detect_dietary_tags(ingredients, steps)
    
    # Infer meal types
    meal_types = _infer_meal_types(title, ingredients)
    
    # Infer season
    season = _infer_season(title, ingredients, occasions)
    
    return {
        "main_ingredients": main_ings,
        "secondary_ingredients": secondary_ings,
        "techniques": techniques,
        "occasions": occasions,
        "moods": moods,
        "dietary_tags": dietary_tags,
        "meal_types": meal_types,
        "season": season,
        "time_minutes": time_minutes,
        "difficulty": difficulty,
    }


def _parse_time_minutes(time_str: str) -> int:
    """Parse ISO-8601 duration to minutes."""
    if not time_str or not time_str.startswith("PT"):
        return 0
    
    # PT20M -> 20, PT1H30M -> 90
    hours = 0
    minutes = 0
    
    h_match = re.search(r"(\d+)H", time_str)
    m_match = re.search(r"(\d+)M", time_str)
    
    if h_match:
        hours = int(h_match.group(1))
    if m_match:
        minutes = int(m_match.group(1))
    
    return hours * 60 + minutes


def _categorize_ingredients(ingredients: list[dict]) -> tuple[list[str], list[str]]:
    """Categorize ingredients into main and secondary."""
    main = []
    secondary = []
    
    # Keywords for secondary ingredients
    secondary_keywords = ["salt", "pepper", "oil", "water", "sugar"]
    
    for ing in ingredients[:15]:  # Max 15
        name = ing.get("name", "").lower().strip()
        if not name or name in ["ingredients", "method"]:
            continue
        
        # Check if secondary
        is_secondary = any(kw in name for kw in secondary_keywords)
        
        if is_secondary:
            secondary.append(name)
        else:
            main.append(name)
    
    # Limit to top 8 main, 5 secondary
    return main[:8], secondary[:5]


def _detect_techniques(steps: list[dict]) -> list[str]:
    """Detect cooking techniques from steps."""
    techniques = set()
    
    technique_keywords = {
        "bake": ["bake", "baked", "baking", "oven"],
        "grill": ["grill", "grilled", "bbq", "barbecue"],
        "fry": ["fry", "fried", "pan-fry", "sauté", "saute"],
        "boil": ["boil", "boiled", "simmer"],
        "steam": ["steam", "steamed"],
        "roast": ["roast", "roasted"],
        "no-cook": ["no cook", "assemble", "mix", "toss", "combine"],
        "chop": ["chop", "dice", "slice", "cut"],
        "whisk": ["whisk", "beat", "mix"],
    }
    
    all_text = " ".join(step.get("descr", "") + " " + step.get("instructions", "") for step in steps).lower()
    
    for tech, keywords in technique_keywords.items():
        if any(kw in all_text for kw in keywords):
            techniques.add(tech)
    
    return sorted(techniques)


def _infer_occasions(title: str, ingredients: list[dict], steps: list[dict]) -> list[str]:
    """Infer occasions from title and content."""
    occasions = []
    
    occasion_keywords = {
        "christmas": ["christmas", "xmas", "festive"],
        "holiday": ["holiday", "celebration"],
        "party": ["party", "gathering"],
        "bbq": ["bbq", "barbecue", "grill"],
        "weeknight": ["quick", "easy", "simple"],
        "weekend": ["special", "impressive"],
    }
    
    content = title + " " + " ".join(ing.get("name", "") for ing in ingredients)
    content = content.lower()
    
    for occasion, keywords in occasion_keywords.items():
        if any(kw in content for kw in keywords):
            occasions.append(occasion)
    
    return occasions


def _infer_moods(title: str, ingredients: list[dict], techniques: list[str], time_minutes: int) -> list[str]:
    """Infer moods/feelings from recipe."""
    moods = []
    
    content = title + " " + " ".join(ing.get("name", "") for ing in ingredients)
    content = content.lower()
    
    # Quick mood
    if time_minutes <= 30 or "quick" in techniques or "no-cook" in techniques:
        moods.append("quick")
    
    # Fresh mood
    if any(w in content for w in ["fresh", "salad", "raw", "crisp"]):
        moods.append("fresh")
    
    # Comfort mood
    if any(w in content for w in ["comfort", "hearty", "warm", "cozy", "bake", "roast"]):
        moods.append("comfort")
    
    # Light mood
    if any(w in content for w in ["light", "healthy", "salad"]):
        moods.append("light")
    
    # Festive mood
    if any(w in content for w in ["festive", "celebration", "party", "christmas"]):
        moods.append("festive")
    
    return moods


def _detect_dietary_tags(ingredients: list[dict], steps: list[dict]) -> list[str]:
    """Detect dietary restrictions."""
    tags = []
    
    ing_names = " ".join(ing.get("name", "") for ing in ingredients).lower()
    
    # Check for animal products
    animal_keywords = ["meat", "beef", "pork", "chicken", "fish", "egg", "dairy", "milk", "cheese", "butter"]
    has_animal = any(kw in ing_names for kw in animal_keywords)
    
    if not has_animal:
        tags.append("vegetarian")
        tags.append("vegan")
    elif not any(kw in ing_names for kw in ["meat", "beef", "pork", "chicken", "fish"]):
        tags.append("vegetarian")
    
    # Gluten-free check (heuristic)
    gluten_keywords = ["flour", "bread", "pasta", "wheat"]
    if not any(kw in ing_names for kw in gluten_keywords):
        tags.append("gluten-free")
    
    return tags


def _infer_meal_types(title: str, ingredients: list[dict]) -> list[str]:
    """Infer meal types from title and ingredients."""
    meal_types = []
    
    content = title + " " + " ".join(ing.get("name", "") for ing in ingredients)
    content = content.lower()
    
    # Breakfast
    if any(w in content for w in ["breakfast", "morning", "egg", "toast", "cereal"]):
        meal_types.append("breakfast")
    
    # Side dish
    if any(w in content for w in ["side", "salad", "vegetable"]):
        meal_types.append("side")
    
    # Main course (default if not side)
    if not meal_types or "salad" not in content:
        meal_types.extend(["lunch", "dinner"])
    
    # Snack
    if any(w in content for w in ["snack", "appetizer", "starter"]):
        meal_types.append("snack")
    
    return meal_types


def _infer_season(title: str, ingredients: list[dict], occasions: list[str]) -> str | None:
    """Infer season from title, ingredients, and occasions."""
    content = title + " " + " ".join(ing.get("name", "") for ing in ingredients)
    content = content.lower()
    
    # Winter
    if "christmas" in occasions or any(w in content for w in ["winter", "christmas", "holiday"]):
        return "winter"
    
    # Summer
    if any(w in content for w in ["summer", "grill", "bbq", "fresh"]):
        return "summer"
    
    # Spring
    if any(w in content for w in ["spring", "fresh", "light"]):
        return "spring"
    
    # Fall
    if any(w in content for w in ["fall", "autumn", "pumpkin", "squash"]):
        return "fall"
    
    return None


