#!/usr/bin/env python3
"""Diagnose chunker input size to understand timeout issues."""

import json
from pathlib import Path


def diagnose_input(json_path: str):
    """Show what the chunker is actually sending to the LLM."""
    
    json_file = Path(json_path)
    with open(json_file, "r", encoding="utf-8") as f:
        joav0_doc = json.load(f)
    
    # Serialize as it would be sent to LLM
    joav0_str = json.dumps(joav0_doc, ensure_ascii=False, indent=2)
    
    recipe_id = joav0_doc["recipe"]["id"]
    title = joav0_doc["recipe"]["title"]
    
    # Count ingredients and steps
    num_ingredients = len(joav0_doc["ingredients"])
    num_steps = len(joav0_doc["steps"])
    
    # Calculate sizes
    prompt_template = f"""Generate search-intent chunks for semantic search based on the structured recipe JSON. 
Analyze the recipe and create as many chunks as needed to cover all meaningful search angles. 
Each chunk should be a concise, standalone queryable concept that someone might search for. 
Consider: main ingredients, cuisine type, meal type, cooking method, dietary tags, flavor profiles, occasions, difficulty, time. 
Return ONLY a JSON array; each item has chunk_text, search_intent, llm_analysis (object, can be {{}}).
No markdown, no extra text.
recipe_id: {recipe_id}
RECIPE_JSON: {joav0_str}"""
    
    total_chars = len(prompt_template)
    # Rough token estimate (1 token ≈ 4 chars for English)
    estimated_tokens = total_chars / 4
    
    print("\n" + "="*70)
    print("CHUNKER INPUT DIAGNOSIS")
    print("="*70)
    print(f"\nRecipe: {title}")
    print(f"ID: {recipe_id}")
    print(f"\nStructure:")
    print(f"  - Ingredients: {num_ingredients}")
    print(f"  - Steps: {num_steps}")
    print(f"\nInput Size:")
    print(f"  - Total characters: {total_chars:,}")
    print(f"  - Estimated tokens: {estimated_tokens:,.0f}")
    print(f"  - JSON size: {len(joav0_str):,} chars")
    
    # Show JSON structure sizes
    print(f"\nJSON Breakdown:")
    recipe_str = json.dumps(joav0_doc["recipe"], ensure_ascii=False)
    ingredients_str = json.dumps(joav0_doc["ingredients"], ensure_ascii=False)
    steps_str = json.dumps(joav0_doc["steps"], ensure_ascii=False)
    
    print(f"  - recipe metadata: {len(recipe_str):,} chars")
    print(f"  - ingredients: {len(ingredients_str):,} chars")
    print(f"  - steps: {len(steps_str):,} chars")
    
    # Analyze steps in detail
    if num_steps > 0:
        step_sizes = [len(json.dumps(step)) for step in joav0_doc["steps"]]
        avg_step_size = sum(step_sizes) / len(step_sizes)
        max_step_size = max(step_sizes)
        print(f"\nStep Details:")
        print(f"  - Avg step size: {avg_step_size:.0f} chars")
        print(f"  - Max step size: {max_step_size} chars")
        print(f"  - Total steps JSON: {sum(step_sizes):,} chars")
    
    # Show sample of what's being sent
    print(f"\n" + "="*70)
    print("SAMPLE INPUT (first 500 chars):")
    print("="*70)
    print(prompt_template[:500])
    print("\n[...truncated...]")
    
    # Recommendations
    print(f"\n" + "="*70)
    print("ANALYSIS:")
    print("="*70)
    
    if estimated_tokens > 3000:
        print("⚠️  Input is VERY LARGE (>3000 tokens)")
        print("   This will cause timeouts with llama3.2 and likely with llama3.1")
    elif estimated_tokens > 2000:
        print("⚠️  Input is LARGE (>2000 tokens)")
        print("   May cause timeouts, especially with llama3.2")
    else:
        print("✅ Input size is reasonable (<2000 tokens)")
    
    print(f"\nRecommendations:")
    if len(steps_str) > len(ingredients_str):
        print("  1. Steps are the largest part - consider summarizing step descriptions")
    if len(ingredients_str) > 1000:
        print("  2. Ingredients list is large - consider sending only ingredient names")
    if estimated_tokens > 2000:
        print("  3. Consider deterministic chunking (no LLM) for large recipes")
        print("  4. Or split into multiple smaller LLM calls")
    
    print()


if __name__ == "__main__":
    import sys
    json_path = sys.argv[1] if len(sys.argv) > 1 else "data/recipes_json/christmas-salad-jamie-oliver-recipes.json"
    diagnose_input(json_path)

