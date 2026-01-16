# Recipe Pipeline

A comprehensive pipeline for crawling, transforming, enhancing, and uploading recipes for the Jamie Oliver AI cooking assistant.

## Overview

```
Jamie Oliver URL → Crawler → Transformer → (LLM Enhancer) → Validator → Uploader
                     ↓
              Media Manager (Downloads Images)
```

## Components

| Component | File | Purpose |
|-----------|------|---------|
| Models | `models.py` | Data classes for recipe formats (SchemaOrg, JOAv0) |
| Crawler | `crawler.py` | Fetches recipes from jamieoliver.com |
| Transformer | `transformer.py` | Converts schema.org → JOAv0 format |
| Media Manager | `media_manager.py` | Downloads and organizes recipe images |
| Enhancer | `enhancer.py` | LLM-powered enhancement for voice cooking |
| Validator | `validator.py` | Quality scoring and validation |
| Uploader | `uploader.py` | Publishes recipes to Supabase |
| CLI | `cli.py` | Command-line interface |

## Installation

```bash
cd apps/backend-search
pip install -r requirements.txt
```

Required environment variables:
- `OPENAI_API_KEY` - For LLM enhancement
- `SUPABASE_URL` - For publishing
- `SUPABASE_SERVICE_ROLE_KEY` - For publishing

## CLI Usage

### Import a single recipe

```bash
# Basic import (crawl + transform only)
python -m recipe_pipeline.cli import --url "URL" --no-images

# Full import with enhancement and publishing
python -m recipe_pipeline.cli import --url "URL" --enhance --publish
```

### Batch import from category

```bash
# Import 10 vegetarian recipes
python -m recipe_pipeline.cli batch-import --category vegetarian --limit 10 --enhance

# Dry run to see what would be imported
python -m recipe_pipeline.cli batch-import --category pasta --limit 5 --dry-run
```

### Enhance existing recipes

```bash
# Enhance all recipes in data/recipes/
python -m recipe_pipeline.cli enhance-existing

# Skip already enhanced recipes
python -m recipe_pipeline.cli enhance-existing --skip-enhanced

# Filter by name pattern
python -m recipe_pipeline.cli enhance-existing --filter risotto
```

### List available categories

```bash
python -m recipe_pipeline.cli list-categories
```

### Test the pipeline

```bash
python -m recipe_pipeline.cli test
```

## Recipe Formats

### Input: schema.org/Recipe (JSON-LD)

Jamie Oliver website embeds structured data:

```json
{
  "@type": "Recipe",
  "name": "Mushroom risotto",
  "recipeIngredient": ["500g mushrooms", "..."],
  "recipeInstructions": [{"@type": "HowToStep", "text": "..."}],
  "totalTime": "PT45M",
  "image": ["https://..."]
}
```

### Output: JOAv0 Format

Voice-optimized format for the cooking assistant:

```json
{
  "recipe": {
    "id": "mushroom-risotto",
    "title": "Mushroom risotto",
    "servings": 4,
    "estimated_total": "PT45M"
  },
  "ingredients": [
    { "id": "mushrooms", "name": "mushrooms", "quantity": 500, "unit": "g" }
  ],
  "steps": [
    {
      "id": "saute_mushrooms",
      "descr": "Sauté the mushrooms",
      "type": "timer",
      "duration": "PT5M",
      "auto_start": false,
      "requires_confirm": true,
      "on_enter": [{ "say": "Let's sauté those lovely mushrooms for about five minutes..." }]
    }
  ]
}
```

## Enhancement Features

The LLM enhancer transforms basic recipes into voice-optimized format:

1. **Semantic Step IDs**: `step_1` → `saute_mushrooms`
2. **TTS-Friendly Text**: "175°C" → "one hundred seventy-five degrees celsius"
3. **Timer Detection**: Extracts durations from instruction text
4. **Jamie Oliver Voice**: Warm, encouraging, conversational tone

## Quality Scoring

The validator checks:

- ✓ Required fields (title, id, steps)
- ✓ Semantic step IDs (not generic)
- ✓ on_enter.say messages
- ✓ Timer detection accuracy
- ✓ requires_confirm flags

Score breakdown:
- 80-100: Production ready
- 60-79: Needs minor improvements
- Below 60: Needs enhancement

## Programmatic Usage

```python
from recipe_pipeline import (
    JamieOliverCrawler,
    SchemaOrgToJOAv0Transformer,
    RecipeEnhancer,
    RecipeValidator,
    upload_recipe
)

# Crawl
crawler = JamieOliverCrawler()
schema_recipe = crawler.fetch_recipe("https://www.jamieoliver.com/recipes/...")

# Transform
transformer = SchemaOrgToJOAv0Transformer()
joa_recipe = transformer.transform(schema_recipe)

# Enhance
enhancer = RecipeEnhancer()
enhanced = enhancer.enhance(joa_recipe.to_dict())

# Validate
validator = RecipeValidator()
result = validator.validate(enhanced)
print(f"Quality score: {result.quality_score}")

# Upload
upload_recipe(enhanced, publish=True)
```

## Related Documentation

- [Recipe Data Platform Architecture](../../../docs/architecture/RECIPE_DATA_PLATFORM.md)
- [Schema.org Recipe](https://schema.org/Recipe)
- [Google Recipe Structured Data](https://developers.google.com/search/docs/appearance/structured-data/recipe)
