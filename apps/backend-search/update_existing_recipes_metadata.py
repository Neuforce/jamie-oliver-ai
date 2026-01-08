#!/usr/bin/env python3
"""
Script para actualizar las recetas JSON existentes con tags, course, y cuisine.

Lee los JSONs de data/recipes/ (monorepo root) y agrega los campos inferidos.
"""

import json
import logging
import sys
from pathlib import Path
from typing import Any

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def infer_recipe_metadata_simple(joav0_doc: dict[str, Any]) -> dict[str, Any]:
    """
    Versión simplificada de infer_recipe_metadata que solo usa heurísticas.
    No requiere LLM ni dependencias externas.
    """
    recipe_meta = joav0_doc.get("recipe", {})
    title = recipe_meta.get("title", "")
    description = recipe_meta.get("description", "")
    ingredients = joav0_doc.get("ingredients", [])
    steps = joav0_doc.get("steps", [])
    
    # Build context
    ingredients_text = ", ".join([ing.get("name", "") for ing in ingredients if isinstance(ing, dict)])
    steps_text = " ".join([step.get("instructions", "") for step in steps if isinstance(step, dict)])[:500]
    
    clean_text = f"{title} {description} {ingredients_text} {steps_text}".lower()
    tags = []
    
    # Infer tags from ingredients and title
    tag_keywords = {
        "pasta": ["pasta", "spaghetti", "penne", "fettuccine", "macaroni", "linguine"],
        "chicken": ["chicken", "pollo"],
        "beef": ["beef", "steak", "brisket", "carne"],
        "pork": ["pork", "ribs", "bacon"],
        "fish": ["fish", "salmon", "tuna", "cod", "halibut"],
        "seafood": ["shrimp", "prawn", "lobster", "crab", "mussel", "clam"],
        "vegetarian": ["vegetarian", "veggie", "tofu", "tempeh"],
        "vegan": ["vegan"],
        "quick": ["quick", "fast", "30-minute", "15-minute", "20-minute"],
        "italian": ["pasta", "parmesan", "risotto", "pesto", "italian"],
        "mexican": ["taco", "salsa", "cilantro", "jalapeño", "mexican"],
        "thai": ["thai", "curry", "coconut", "lemongrass"],
        "chinese": ["chinese", "soy", "ginger", "sesame"],
        "indian": ["indian", "curry", "masala", "tikka"],
        "dessert": ["dessert", "cake", "pie", "pudding", "tart", "cookie", "brownie"],
        "salad": ["salad"],
        "soup": ["soup", "broth"],
        "breakfast": ["breakfast", "pancake", "waffle", "toast", "eggs"],
    }
    
    for tag, keywords in tag_keywords.items():
        if any(kw in clean_text for kw in keywords):
            if tag not in tags:
                tags.append(tag)
    
    # Limit to 8 tags
    tags = tags[:8]
    
    # Infer course
    course = None
    if any(word in clean_text for word in ["salad"]):
        course = "salad"
    elif any(word in clean_text for word in ["soup", "broth"]):
        course = "soup"
    elif any(word in clean_text for word in ["dessert", "cake", "pie", "pudding", "tart", "cookie", "brownie", "tiramisu"]):
        course = "dessert"
    elif any(word in clean_text for word in ["breakfast", "pancake", "waffle", "toast", "eggs benedict"]):
        course = "breakfast"
    elif any(word in clean_text for word in ["appetizer", "starter"]):
        course = "appetizer"
    else:
        course = "main"
    
    # Infer cuisine
    cuisine = None
    if any(word in clean_text for word in ["italian", "pasta", "parmesan", "risotto", "pesto", "lasagna", "carbonara"]):
        cuisine = "italian"
    elif any(word in clean_text for word in ["mexican", "taco", "salsa", "cilantro", "jalapeño", "fajita"]):
        cuisine = "mexican"
    elif any(word in clean_text for word in ["thai", "pad thai", "green curry", "coconut milk"]):
        cuisine = "thai"
    elif any(word in clean_text for word in ["chinese", "soy sauce", "ginger", "sesame", "stir fry"]):
        cuisine = "chinese"
    elif any(word in clean_text for word in ["indian", "curry", "masala", "tikka", "naan"]):
        cuisine = "indian"
    elif any(word in clean_text for word in ["japanese", "sushi", "ramen", "miso"]):
        cuisine = "japanese"
    elif any(word in clean_text for word in ["greek", "feta", "tzatziki", "moussaka"]):
        cuisine = "greek"
    elif any(word in clean_text for word in ["mediterranean", "olive", "hummus"]):
        cuisine = "mediterranean"
    elif any(word in clean_text for word in ["french", "béarnaise", "ratatouille"]):
        cuisine = "french"
    elif any(word in clean_text for word in ["spanish", "paella", "tapas"]):
        cuisine = "spanish"
    
    return {
        "tags": tags,
        "course": course,
        "cuisine": cuisine,
    }


def infer_step_on_enter_simple(step: dict[str, Any]) -> list[dict[str, str]]:
    """
    Versión simplificada de infer_step_on_enter que solo usa heurísticas.
    No requiere LLM ni dependencias externas.
    """
    descr = step.get("descr", "")
    instructions = step.get("instructions", "")
    step_text = descr if descr else instructions
    
    if not step_text:
        return [{"say": "Let's continue with this step."}]
    
    step_lower = step_text.lower()
    import re
    
    # Extract key action verbs and objects - more comprehensive patterns
    action_patterns = [
        (r"^(trim|slice|chop|dice|mince|grate|peel|cut)", "Let's start by {action}."),
        (r"^(heat|warm|preheat|soak)", "Let's {action} the {object}."),
        (r"^(add|place|put|transfer)", "Now {action} the {object}."),
        (r"^(cook|simmer|boil|fry|bake|roast|grill|barbecue)", "Time to {action} the {object}."),
        (r"^(mix|combine|toss|stir|whisk|blend)", "Let's {action} everything together."),
        (r"^(serve|plate|garnish|carve|arrange)", "Time to {action} and enjoy!"),
        (r"^(drain|remove|take out)", "Let's {action} the {object}."),
        (r"^(season|salt|pepper)", "Let's {action} the {object}."),
        (r"^(reserve|set aside|keep)", "Let's {action} the {object} for later."),
    ]
    
    # Try to match patterns
    for pattern, template in action_patterns:
        match = re.search(pattern, step_lower)
        if match:
            action = match.group(1)
            # Try to extract object (next few words after action, skip common words)
            rest = step_lower[match.end():].strip()
            words = [w for w in rest.split()[:4] if w not in ["the", "a", "an", "some", "your"]]
            object_text = " ".join(words[:3]) if words else "ingredients"
            
            # Generate message
            if "{object}" in template:
                message = template.format(action=action, object=object_text)
            else:
                message = template.format(action=action)
            
            # Capitalize first letter
            message = message[0].upper() + message[1:] if message else message
            return [{"say": message}]
    
    # Default fallback - create a more natural message
    words = step_text.split()
    verbs = ["cook", "add", "mix", "heat", "place", "serve", "prepare", "make", "blend", "toss"]
    key_word = None
    for word in words[:5]:
        if any(v in word.lower() for v in verbs):
            key_word = word
            break
    
    if key_word:
        try:
            idx = next(i for i, w in enumerate(words) if key_word.lower() in w.lower())
            following = " ".join(words[idx:idx+4][1:])
            if following:
                return [{"say": f"Let's {key_word.lower()} {following.lower()}."}]
        except (StopIteration, IndexError):
            pass
    
    # Final fallback
    words = step_text.split()[:6]
    summary = " ".join(words)
    return [{"say": f"Let's {summary.lower()}."}]


def update_recipe_metadata(json_path: Path, cfg: Any, dry_run: bool = False) -> bool:
    """
    Actualiza un archivo JSON de receta con tags, course, y cuisine.
    
    Args:
        json_path: Ruta al archivo JSON
        cfg: Configuración del agente
        dry_run: Si True, solo muestra lo que haría sin guardar
    
    Returns:
        True si fue exitoso, False si hubo error
    """
    try:
        # Leer JSON
        with json_path.open("r", encoding="utf-8") as f:
            recipe_doc = json.load(f)
        
        recipe_id = recipe_doc.get("recipe", {}).get("id", json_path.stem)
        title = recipe_doc.get("recipe", {}).get("title", recipe_id)
        
        # Verificar si ya tiene los campos de metadata
        recipe_meta = recipe_doc.get("recipe", {})
        has_tags = "tags" in recipe_meta and recipe_meta.get("tags")
        has_course = "course" in recipe_meta and recipe_meta.get("course")
        has_cuisine = "cuisine" in recipe_meta and recipe_meta.get("cuisine")
        
        # Verificar si los steps tienen on_enter
        steps = recipe_doc.get("steps", [])
        steps_need_on_enter = sum(1 for step in steps if "on_enter" not in step or not step.get("on_enter"))
        
        if has_tags and has_course and has_cuisine and steps_need_on_enter == 0:
            logger.info(f"⏭️  Skipping {title} - already has all metadata and on_enter")
            return True
        
        logger.info(f"📝 Processing: {title} ({recipe_id})")
        
        # Inferir metadata
        try:
            metadata = infer_recipe_metadata_simple(joav0_doc=recipe_doc)
            
            # Actualizar recipe object
            if "recipe" not in recipe_doc:
                recipe_doc["recipe"] = {}
            
            # Solo actualizar campos que no existen o están vacíos
            if not has_tags:
                recipe_doc["recipe"]["tags"] = metadata.get("tags", [])
            if not has_course and metadata.get("course"):
                recipe_doc["recipe"]["course"] = metadata["course"]
            if not has_cuisine and metadata.get("cuisine"):
                recipe_doc["recipe"]["cuisine"] = metadata["cuisine"]
            
            # Add on_enter to steps that don't have it (always check, even if metadata exists)
            steps = recipe_doc.get("steps", [])
            steps_updated = 0
            for step in steps:
                if "on_enter" not in step or not step.get("on_enter"):
                    on_enter = infer_step_on_enter_simple(step)
                    step["on_enter"] = on_enter
                    steps_updated += 1
            
            if steps_updated > 0:
                logger.info(f"  ✅ Added on_enter to {steps_updated} steps")
            
            # Update metadata if needed
            if not has_tags or not has_course or not has_cuisine:
                logger.info(f"  ✅ Tags: {recipe_doc['recipe'].get('tags', [])}")
                logger.info(f"  ✅ Course: {recipe_doc['recipe'].get('course', 'N/A')}")
                logger.info(f"  ✅ Cuisine: {recipe_doc['recipe'].get('cuisine', 'N/A')}")
            
            if not dry_run:
                # Guardar JSON actualizado
                with json_path.open("w", encoding="utf-8") as f:
                    json.dump(recipe_doc, f, ensure_ascii=False, indent=2)
                logger.info(f"  💾 Saved: {json_path.name}")
            else:
                logger.info(f"  🔍 DRY RUN: Would update {json_path.name}")
            
            return True
            
        except Exception as e:
            logger.error(f"  ❌ Failed to infer metadata for {recipe_id}: {e}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Error processing {json_path}: {e}")
        return False


def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Update existing recipe JSONs with tags, course, and cuisine")
    parser.add_argument(
        "--recipes-dir",
        type=str,
        default="../../data/recipes",
        help="Directory containing recipe JSON files (default: ../../data/recipes from monorepo root)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be updated without making changes",
    )
    args = parser.parse_args()
    
    # Resolve recipes directory
    script_dir = Path(__file__).resolve().parent
    if args.recipes_dir.startswith("../"):
        recipes_dir = (script_dir / args.recipes_dir).resolve()
    else:
        recipes_dir = Path(args.recipes_dir).resolve()
    if not recipes_dir.exists():
        logger.error(f"❌ Recipes directory not found: {recipes_dir}")
        sys.exit(1)
    
    logger.info(f"📂 Reading recipes from: {recipes_dir}")
    
    # No config needed for simple version
    
    # Find all JSON files
    json_files = sorted(recipes_dir.glob("*.json"))
    if not json_files:
        logger.error(f"❌ No JSON files found in {recipes_dir}")
        sys.exit(1)
    
    logger.info(f"📋 Found {len(json_files)} recipe files")
    
    if args.dry_run:
        logger.info("🔍 DRY RUN MODE - No files will be modified")
    
    # Process each file
    success_count = 0
    error_count = 0
    skipped_count = 0
    
    for json_file in json_files:
        result = update_recipe_metadata(json_file, None, dry_run=args.dry_run)
        if result:
            success_count += 1
        else:
            error_count += 1
    
    # Summary
    logger.info("\n" + "="*60)
    logger.info("📊 Summary:")
    logger.info(f"  ✅ Successfully processed: {success_count}")
    logger.info(f"  ❌ Errors: {error_count}")
    logger.info(f"  📁 Total files: {len(json_files)}")
    logger.info("="*60)
    
    if error_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
