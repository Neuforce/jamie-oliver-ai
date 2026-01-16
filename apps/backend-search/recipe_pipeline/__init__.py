"""
Recipe Pipeline

A comprehensive pipeline for:
- Crawling recipes from jamieoliver.com
- Transforming schema.org/Recipe to JOAv0 format
- Enhancing with LLM for voice-guided cooking
- Managing recipe media assets
- Uploading to Supabase database

Usage:
    # CLI
    python -m recipe_pipeline.cli import --url "URL" --enhance --publish
    
    # Programmatic
    from recipe_pipeline import RecipePipeline
    pipeline = RecipePipeline(enhance=True)
    recipe = pipeline.import_recipe(url)
"""

from .models import (
    SchemaOrgRecipe,
    JOAv0Recipe,
    Ingredient,
    Step,
    StepType,
    OnEnter,
    ImageInfo,
    NutritionInfo,
)
from .crawler import (
    JamieOliverCrawler,
    CrawlerError,
    RecipeNotFoundError,
    fetch_recipe,
)
from .transformer import (
    SchemaOrgToJOAv0Transformer,
    TransformError,
    transform_recipe,
)
from .media_manager import (
    MediaManager,
    MediaError,
    download_recipe_images,
)
from .enhancer import RecipeEnhancer
from .validator import RecipeValidator, ValidationResult
from .uploader import RecipeUploader, upload_recipe

__all__ = [
    # Models
    "SchemaOrgRecipe",
    "JOAv0Recipe", 
    "Ingredient",
    "Step",
    "StepType",
    "OnEnter",
    "ImageInfo",
    "NutritionInfo",
    # Crawler
    "JamieOliverCrawler",
    "CrawlerError",
    "RecipeNotFoundError",
    "fetch_recipe",
    # Transformer
    "SchemaOrgToJOAv0Transformer",
    "TransformError",
    "transform_recipe",
    # Media
    "MediaManager",
    "MediaError",
    "download_recipe_images",
    # Enhancement
    "RecipeEnhancer",
    # Validation
    "RecipeValidator",
    "ValidationResult",
    # Upload
    "RecipeUploader",
    "upload_recipe",
]
