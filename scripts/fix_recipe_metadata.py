#!/usr/bin/env python3
"""
Fix Recipe Metadata Errors

This script corrects the course, cuisine, and tags metadata that was incorrectly
assigned during LLM enhancement.
"""

import json
from pathlib import Path

# Directory containing recipe files
RECIPES_DIR = Path(__file__).parent.parent / "data" / "recipes"

# Correct course assignments based on recipe content
COURSE_FIXES = {
    # Should be DESSERT
    "tiramisu.json": "dessert",
    "chocolate-brownies.json": "dessert",
    "chocolate-chip-cookies.json": "dessert",
    "classic-apple-pie.json": "dessert",
    "creme-brulee.json": "dessert",
    "lemon-tart.json": "dessert",
    
    # Should be BREAKFAST
    "avocado-toast.json": "breakfast",
    "banana-bread.json": "breakfast",
    "eggs-benedict.json": "breakfast",
    "french-toast.json": "breakfast",
    "fluffy-pancakes.json": "breakfast",
    "full-english-breakfast.json": "breakfast",
    
    # Should be MAIN
    "beef-kebabs.json": "main",
    "beef-stir-fry.json": "main",
    "beef-tacos.json": "main",
    "beef-wellington.json": "main",
    "buffalo-chicken-wings.json": "appetizer",
    "chicken-fajitas.json": "main",
    "chicken-parmesan.json": "main",
    "chicken-tikka-masala.json": "main",
    "classic-lasagna.json": "main",
    "classic-spaghetti-carbonara.json": "main",
    "fish-and-chips.json": "main",
    "fish-tacos.json": "main",
    "grilled-salmon-with-lemon.json": "main",
    "happy-fish-pie.json": "main",
    "lobster-tail.json": "main",
    "margherita-pizza.json": "main",
    "meatballs-in-marinara.json": "main",
    "moussaka.json": "main",
    "mushroom-risotto.json": "main",
    "pad-thai.json": "main",
    "pesto-pasta.json": "main",
    "pork-chops-with-apples.json": "main",
    "pulled-pork-sandwich.json": "main",
    "roast-chicken-dinner.json": "main",
    "shepherds-pie.json": "main",
    "shrimp-scampi.json": "main",
    "smoked-salmon-pasta-jamie-oliver-recipes.json": "main",
    "somali-beef-stew-jamie-oliver-recipes.json": "main",
    "steak-and-fries.json": "main",
    "sumptuous-squash-risotto.json": "main",
    "sushi-rolls.json": "main",
    "thai-green-curry.json": "main",
    "tomato-mussel-pasta.json": "main",
    "vegetable-curry.json": "main",
    "gourmet-beef-burger.json": "main",
    
    # Should be SOUP
    "beef-ramen.json": "soup",
    "chicken-noodle-soup.json": "soup",
    "french-onion-soup.json": "soup",
    "fresh-tomato-soup.json": "soup",
    
    # Should be SALAD
    "chicken-caesar-salad.json": "salad",
    "christmas-salad-jamie-oliver-recipes.json": "salad",
    "quinoa-salad.json": "salad",
    
    # Should be SIDE
    "garlic-bread.json": "side",
}

# Correct cuisine assignments
CUISINE_FIXES = {
    "sushi-rolls.json": "japanese",
    "moussaka.json": "greek",
    "quinoa-salad.json": "mediterranean",
    "somali-beef-stew-jamie-oliver-recipes.json": "somali",
    "beef-ramen.json": "japanese",
    "banana-bread.json": "american",
    "beef-wellington.json": "british",
    "buffalo-chicken-wings.json": "american",
    "chicken-noodle-soup.json": "american",
    "chocolate-brownies.json": "american",
    "chocolate-chip-cookies.json": "american",
    "classic-apple-pie.json": "american",
    "creme-brulee.json": "french",
    "eggs-benedict.json": "american",
    "fish-and-chips.json": "british",
    "fluffy-pancakes.json": "american",
    "full-english-breakfast.json": "british",
    "gourmet-beef-burger.json": "american",
    "lemon-tart.json": "french",
    "lobster-tail.json": "american",
    "pork-chops-with-apples.json": "american",
    "pulled-pork-sandwich.json": "american",
    "roast-chicken-dinner.json": "british",
    "shepherds-pie.json": "british",
    "steak-and-fries.json": "american",
}

# Tags to REMOVE (incorrectly assigned)
TAGS_TO_REMOVE = {
    "beef-ramen.json": ["breakfast"],
    "chicken-caesar-salad.json": ["dessert"],
    "chicken-parmesan.json": ["breakfast"],
    "chocolate-brownies.json": ["breakfast"],
    "chocolate-chip-cookies.json": ["breakfast"],
    "french-onion-soup.json": ["breakfast"],
    "full-english-breakfast.json": ["dessert"],
    "happy-fish-pie.json": ["dessert", "breakfast"],
    "lemon-tart.json": ["breakfast"],
    "pad-thai.json": ["breakfast"],
    "sushi-rolls.json": ["dessert", "chinese"],
    "tiramisu.json": ["breakfast"],
    "fluffy-pancakes.json": ["dessert"],  # Keep breakfast, remove dessert
    "mushroom-risotto.json": ["breakfast"],
}

# Tags to ADD
TAGS_TO_ADD = {
    "creme-brulee.json": ["dessert", "french"],
    "shepherds-pie.json": ["comfort", "british"],
    "happy-fish-pie.json": ["comfort", "british"],
    "sushi-rolls.json": ["japanese"],
    "moussaka.json": ["greek", "comfort"],
}


def fix_recipe(filepath: Path) -> bool:
    """Fix a single recipe file. Returns True if changes were made."""
    filename = filepath.name
    changes_made = False
    
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    recipe = data.get('recipe', {})
    
    # Fix course
    if filename in COURSE_FIXES:
        old_course = recipe.get('course')
        new_course = COURSE_FIXES[filename]
        if old_course != new_course:
            print(f"  [course] {old_course} → {new_course}")
            recipe['course'] = new_course
            changes_made = True
    
    # Fix cuisine
    if filename in CUISINE_FIXES:
        old_cuisine = recipe.get('cuisine')
        new_cuisine = CUISINE_FIXES[filename]
        if old_cuisine != new_cuisine:
            print(f"  [cuisine] {old_cuisine} → {new_cuisine}")
            recipe['cuisine'] = new_cuisine
            changes_made = True
    
    # Remove bad tags
    if filename in TAGS_TO_REMOVE:
        tags = recipe.get('tags', [])
        for bad_tag in TAGS_TO_REMOVE[filename]:
            if bad_tag in tags:
                print(f"  [tags] removing '{bad_tag}'")
                tags.remove(bad_tag)
                changes_made = True
        recipe['tags'] = tags
    
    # Add missing tags
    if filename in TAGS_TO_ADD:
        tags = recipe.get('tags', [])
        for new_tag in TAGS_TO_ADD[filename]:
            if new_tag not in tags:
                print(f"  [tags] adding '{new_tag}'")
                tags.append(new_tag)
                changes_made = True
        recipe['tags'] = tags
    
    # Save if changes were made
    if changes_made:
        data['recipe'] = recipe
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
    
    return changes_made


def main():
    print("=" * 60)
    print("Recipe Metadata Fix Script")
    print("=" * 60)
    
    total_fixed = 0
    
    for filepath in sorted(RECIPES_DIR.glob("*.json")):
        print(f"\n{filepath.name}")
        if fix_recipe(filepath):
            total_fixed += 1
        else:
            print("  (no changes needed)")
    
    print("\n" + "=" * 60)
    print(f"Fixed {total_fixed} recipes")
    print("=" * 60)


if __name__ == "__main__":
    main()
