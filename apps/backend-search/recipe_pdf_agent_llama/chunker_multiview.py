"""Multi-view chunk generator for semantic search optimization."""

from __future__ import annotations

from hashlib import sha256
from typing import Any

from recipe_pdf_agent_llama.chunker_semantic import analyze_recipe_semantics


def _hash_chunk(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()


def generate_multiview_chunks(
    *,
    recipe_id: str,
    joav0_doc: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Generate chunks from multiple semantic perspectives.
    
    Views generated:
    1. Title + metadata (baseline)
    2. Ingredient-focused (multiple)
    3. Time-focused
    4. Difficulty-focused
    5. Technique-focused
    6. Occasion-focused
    7. Mood-focused
    8. Dietary-focused
    9. Natural language combined
    """
    # Analyze semantics
    semantics = analyze_recipe_semantics(joav0_doc)
    recipe = joav0_doc["recipe"]
    title = recipe.get("title", recipe_id.replace("-", " ").title())
    
    chunks = []
    
    # View 1: Title + metadata (baseline)
    chunks.extend(_create_metadata_views(title, recipe, semantics))
    
    # View 2: Ingredient-focused
    chunks.extend(_create_ingredient_views(title, semantics))
    
    # View 3: Time-focused
    chunks.extend(_create_time_views(title, semantics))
    
    # View 4: Difficulty-focused
    chunks.extend(_create_difficulty_views(title, semantics))
    
    # View 5: Technique-focused
    chunks.extend(_create_technique_views(title, semantics))
    
    # View 6: Occasion-focused
    chunks.extend(_create_occasion_views(title, semantics))
    
    # View 7: Mood-focused
    chunks.extend(_create_mood_views(title, semantics))
    
    # View 8: Dietary-focused
    chunks.extend(_create_dietary_views(title, semantics))
    
    # View 9: Natural language combined
    chunks.extend(_create_natural_language_views(title, semantics))
    
    return chunks


def _create_metadata_views(title: str, recipe: dict, semantics: dict) -> list[dict]:
    """Create metadata-focused chunks."""
    chunks = []
    
    # Full metadata
    text = f"{title} - {recipe.get('difficulty', 'Unknown')} - {recipe.get('estimated_total', 'PT20M')} - {recipe.get('servings', 1)} servings"
    chunks.append({
        "chunk_text": text,
        "chunk_hash": _hash_chunk(text),
        "search_intent": "find recipe by name and metadata",
        "view_type": "metadata",
        "llm_analysis": {"type": "title_metadata"},
    })
    
    return chunks


def _create_ingredient_views(title: str, semantics: dict) -> list[dict]:
    """Create ingredient-focused chunks."""
    chunks = []
    main_ings = semantics["main_ingredients"]
    
    if not main_ings:
        return chunks
    
    # View: All main ingredients
    ing_list = ", ".join(main_ings[:8])
    text = f"{title} with {ing_list}"
    chunks.append({
        "chunk_text": text,
        "chunk_hash": _hash_chunk(text),
        "search_intent": "find recipe by main ingredients",
        "view_type": "ingredient_all",
        "llm_analysis": {"type": "ingredients", "count": len(main_ings)},
    })
    
    # View: Individual key ingredients (top 5)
    for ing in main_ings[:5]:
        text = f"{ing} in {title}"
        chunks.append({
            "chunk_text": text,
            "chunk_hash": _hash_chunk(text),
            "search_intent": f"find recipes with {ing}",
            "view_type": "ingredient_single",
            "llm_analysis": {"type": "single_ingredient", "ingredient": ing},
        })
    
    # View: First ingredient as hero
    if main_ings:
        text = f"{main_ings[0].title()} {title.split()[-1] if len(title.split()) > 1 else 'recipe'}"
        chunks.append({
            "chunk_text": text,
            "chunk_hash": _hash_chunk(text),
            "search_intent": f"find {main_ings[0]} recipes",
            "view_type": "ingredient_hero",
            "llm_analysis": {"type": "hero_ingredient", "ingredient": main_ings[0]},
        })
    
    return chunks


def _create_time_views(title: str, semantics: dict) -> list[dict]:
    """Create time-focused chunks."""
    chunks = []
    time_min = semantics["time_minutes"]
    
    if time_min == 0:
        return chunks
    
    # View: Exact time
    text = f"{time_min}-minute {title}"
    chunks.append({
        "chunk_text": text,
        "chunk_hash": _hash_chunk(text),
        "search_intent": "find recipes by specific time",
        "view_type": "time_exact",
        "llm_analysis": {"type": "time", "minutes": time_min},
    })
    
    # View: Time bucket
    if time_min <= 20:
        bucket = "quick 20-minute"
    elif time_min <= 30:
        bucket = "under 30-minute"
    elif time_min <= 60:
        bucket = "under 1-hour"
    else:
        bucket = "leisurely"
    
    text = f"{bucket} {title}"
    chunks.append({
        "chunk_text": text,
        "chunk_hash": _hash_chunk(text),
        "search_intent": "find recipes by time range",
        "view_type": "time_bucket",
        "llm_analysis": {"type": "time_bucket", "bucket": bucket},
    })
    
    return chunks


def _create_difficulty_views(title: str, semantics: dict) -> list[dict]:
    """Create difficulty-focused chunks."""
    chunks = []
    difficulty = semantics["difficulty"]
    
    if not difficulty:
        return chunks
    
    text = f"{difficulty} {title}"
    chunks.append({
        "chunk_text": text,
        "chunk_hash": _hash_chunk(text),
        "search_intent": "find recipes by difficulty level",
        "view_type": "difficulty",
        "llm_analysis": {"type": "difficulty", "level": difficulty},
    })
    
    return chunks


def _create_technique_views(title: str, semantics: dict) -> list[dict]:
    """Create technique-focused chunks."""
    chunks = []
    techniques = semantics["techniques"]
    
    for tech in techniques[:3]:  # Top 3 techniques
        text = f"{tech} {title}"
        chunks.append({
            "chunk_text": text,
            "chunk_hash": _hash_chunk(text),
            "search_intent": f"find recipes using {tech}",
            "view_type": "technique",
            "llm_analysis": {"type": "technique", "technique": tech},
        })
    
    return chunks


def _create_occasion_views(title: str, semantics: dict) -> list[dict]:
    """Create occasion-focused chunks."""
    chunks = []
    occasions = semantics["occasions"]
    
    for occasion in occasions:
        text = f"{occasion} {title}"
        chunks.append({
            "chunk_text": text,
            "chunk_hash": _hash_chunk(text),
            "search_intent": f"find recipes for {occasion}",
            "view_type": "occasion",
            "llm_analysis": {"type": "occasion", "occasion": occasion},
        })
    
    return chunks


def _create_mood_views(title: str, semantics: dict) -> list[dict]:
    """Create mood-focused chunks."""
    chunks = []
    moods = semantics["moods"]
    
    for mood in moods:
        text = f"{mood} {title}"
        chunks.append({
            "chunk_text": text,
            "chunk_hash": _hash_chunk(text),
            "search_intent": f"find {mood} recipes",
            "view_type": "mood",
            "llm_analysis": {"type": "mood", "mood": mood},
        })
    
    return chunks


def _create_dietary_views(title: str, semantics: dict) -> list[dict]:
    """Create dietary restriction-focused chunks."""
    chunks = []
    dietary_tags = semantics["dietary_tags"]
    
    for tag in dietary_tags:
        text = f"{tag} {title}"
        chunks.append({
            "chunk_text": text,
            "chunk_hash": _hash_chunk(text),
            "search_intent": f"find {tag} recipes",
            "view_type": "dietary",
            "llm_analysis": {"type": "dietary", "tag": tag},
        })
    
    return chunks


def _create_natural_language_views(title: str, semantics: dict) -> list[dict]:
    """Create natural language combined chunks."""
    chunks = []
    
    # Combine multiple attributes for natural queries
    components = []
    
    # Add time if quick
    if semantics["time_minutes"] <= 30:
        components.append("quick")
    
    # Add primary mood
    if semantics["moods"]:
        components.append(semantics["moods"][0])
    
    # Add primary occasion
    if semantics["occasions"]:
        components.append(semantics["occasions"][0])
    
    # Add primary ingredient
    if semantics["main_ingredients"]:
        components.append(f"with {semantics['main_ingredients'][0]}")
    
    if len(components) >= 2:
        text = f"{' '.join(components[:3])} {title}"
        chunks.append({
            "chunk_text": text,
            "chunk_hash": _hash_chunk(text),
            "search_intent": "natural language query",
            "view_type": "natural_language",
            "llm_analysis": {"type": "natural_combined", "components": components},
        })
    
    return chunks


