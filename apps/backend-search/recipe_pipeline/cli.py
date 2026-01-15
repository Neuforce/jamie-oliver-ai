"""
Recipe Pipeline CLI

Command-line interface for the recipe ingestion and transformation pipeline.

Usage:
    python -m recipe_pipeline.cli import --url "URL" [--enhance] [--publish]
    python -m recipe_pipeline.cli batch-import --category "vegetarian" --limit 50
    python -m recipe_pipeline.cli enhance-all [--filter status=draft]
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Try loading from multiple locations
    env_paths = [
        Path(__file__).parent.parent / ".env",  # apps/backend-search/.env
        Path(__file__).parent.parent.parent.parent / ".env",  # project root .env
    ]
    for env_path in env_paths:
        if env_path.exists():
            load_dotenv(env_path)
except ImportError:
    pass  # dotenv not installed, rely on system env vars

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from recipe_pipeline.crawler import JamieOliverCrawler, CrawlerError, RecipeNotFoundError
from recipe_pipeline.transformer import SchemaOrgToJOAv0Transformer
from recipe_pipeline.media_manager import MediaManager
from recipe_pipeline.enhancer import RecipeEnhancer
from recipe_pipeline.validator import RecipeValidator
from recipe_pipeline.uploader import upload_recipe

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("recipe_pipeline")


class RecipePipeline:
    """
    Orchestrates the full recipe ingestion pipeline.
    
    Pipeline stages:
    1. Crawl - Fetch recipe from Jamie Oliver website
    2. Transform - Convert schema.org to JOAv0 format
    3. Download Media - Fetch recipe images
    4. Enhance - Use LLM to improve step IDs and TTS text
    5. Validate - Ensure recipe meets schema requirements
    6. Upload - Save to Supabase database
    """
    
    def __init__(
        self,
        enhance: bool = True,
        download_images: bool = True,
        publish: bool = False,
        output_dir: Optional[Path] = None
    ):
        """
        Initialize pipeline.
        
        Args:
            enhance: Whether to enhance recipes with LLM
            download_images: Whether to download recipe images
            publish: Whether to publish recipes immediately
            output_dir: Directory for output files (default: data/recipes)
        """
        self.enhance = enhance
        self.download_images = download_images
        self.publish = publish
        self.output_dir = output_dir or Path("data/recipes")
        
        # Initialize components
        self.crawler = JamieOliverCrawler()
        self.transformer = SchemaOrgToJOAv0Transformer()
        self.media_manager = MediaManager()
        self.enhancer = RecipeEnhancer() if enhance else None
        self.validator = RecipeValidator()
        
        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def import_recipe(self, url: str) -> dict:
        """
        Import a single recipe from URL.
        
        Args:
            url: Jamie Oliver recipe URL
            
        Returns:
            Imported recipe as dict
        """
        logger.info(f"=" * 60)
        logger.info(f"Importing recipe from: {url}")
        logger.info(f"=" * 60)
        
        # Stage 1: Crawl
        logger.info("Stage 1/6: Crawling...")
        schema_recipe = self.crawler.fetch_recipe(url)
        logger.info(f"  ✓ Fetched: {schema_recipe.name}")
        logger.info(f"  ✓ {len(schema_recipe.ingredients)} ingredients, {len(schema_recipe.instructions)} steps")
        
        # Stage 2: Transform
        logger.info("Stage 2/6: Transforming...")
        joa_recipe = self.transformer.transform(schema_recipe)
        logger.info(f"  ✓ Generated ID: {joa_recipe.id}")
        
        # Stage 3: Download Media
        if self.download_images and joa_recipe.images:
            logger.info("Stage 3/6: Downloading images...")
            local_paths = self.media_manager.download_recipe_images(
                joa_recipe.id,
                joa_recipe.images
            )
            logger.info(f"  ✓ Downloaded {len(local_paths)} images")
        else:
            logger.info("Stage 3/6: Skipping image download")
        
        # Convert to dict for enhancement
        recipe_dict = joa_recipe.to_dict()
        
        # Stage 4: Enhance with LLM
        if self.enhance and self.enhancer:
            logger.info("Stage 4/6: Enhancing with LLM...")
            try:
                recipe_dict = self.enhancer.enhance(recipe_dict)
                logger.info("  ✓ Enhanced step IDs and TTS text")
            except Exception as e:
                logger.warning(f"  ⚠ Enhancement failed: {e}")
        else:
            logger.info("Stage 4/6: Skipping LLM enhancement")
        
        # Stage 5: Validate
        logger.info("Stage 5/6: Validating...")
        validation_result = self.validator.validate(recipe_dict)
        if validation_result.is_valid:
            logger.info(f"  ✓ Recipe is valid (quality score: {validation_result.quality_score})")
        else:
            logger.warning(f"  ⚠ Validation warnings: {validation_result.errors}")
        
        # Stage 6: Save/Upload
        logger.info("Stage 6/6: Saving...")
        
        # Save to local file
        output_file = self.output_dir / f"{joa_recipe.id}.json"
        with open(output_file, "w") as f:
            json.dump(recipe_dict, f, indent=2)
        logger.info(f"  ✓ Saved to: {output_file}")
        
        # Upload to Supabase if publish is enabled
        if self.publish:
            try:
                upload_recipe(recipe_dict, publish=True)
                logger.info("  ✓ Published to Supabase")
            except Exception as e:
                logger.warning(f"  ⚠ Upload failed: {e}")
        
        logger.info("=" * 60)
        logger.info(f"✓ Successfully imported: {schema_recipe.name}")
        logger.info("=" * 60)
        
        return recipe_dict
    
    def batch_import(
        self, 
        urls: list[str], 
        continue_on_error: bool = True
    ) -> tuple[list[dict], list[str]]:
        """
        Import multiple recipes.
        
        Args:
            urls: List of recipe URLs
            continue_on_error: Whether to continue if a recipe fails
            
        Returns:
            Tuple of (successful recipes, failed URLs)
        """
        successful = []
        failed = []
        
        for i, url in enumerate(urls):
            logger.info(f"\n[{i + 1}/{len(urls)}] Processing: {url}")
            
            try:
                recipe = self.import_recipe(url)
                successful.append(recipe)
            except (CrawlerError, RecipeNotFoundError) as e:
                logger.error(f"Failed to import {url}: {e}")
                failed.append(url)
                if not continue_on_error:
                    break
            except Exception as e:
                logger.error(f"Unexpected error importing {url}: {e}")
                failed.append(url)
                if not continue_on_error:
                    break
        
        return successful, failed


def cmd_import(args):
    """Handle 'import' command."""
    pipeline = RecipePipeline(
        enhance=args.enhance,
        download_images=not args.no_images,
        publish=args.publish
    )
    
    try:
        recipe = pipeline.import_recipe(args.url)
        print(f"\n✓ Successfully imported: {recipe['recipe']['title']}")
        print(f"  ID: {recipe['recipe']['id']}")
        print(f"  Steps: {len(recipe.get('steps', []))}")
        print(f"  Ingredients: {len(recipe.get('ingredients', []))}")
        return 0
    except RecipeNotFoundError as e:
        print(f"\n✗ Recipe not found: {e}", file=sys.stderr)
        return 1
    except CrawlerError as e:
        print(f"\n✗ Crawl error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        return 1


def cmd_batch_import(args):
    """Handle 'batch-import' command."""
    pipeline = RecipePipeline(
        enhance=args.enhance,
        download_images=not args.no_images,
        publish=args.publish
    )
    
    # Get URLs from category or sitemap
    crawler = JamieOliverCrawler()
    
    if args.category:
        print(f"Fetching recipes from category: {args.category}")
        urls = crawler.fetch_recipe_urls_from_category(args.category, args.limit)
    else:
        print("Fetching recipes from sitemap...")
        urls = crawler.fetch_recipe_urls_from_sitemap(args.limit)
    
    if not urls:
        print("No recipe URLs found!", file=sys.stderr)
        return 1
    
    print(f"Found {len(urls)} recipes to import")
    
    if args.dry_run:
        print("\n[DRY RUN] Would import:")
        for url in urls:
            print(f"  - {url}")
        return 0
    
    # Import all
    successful, failed = pipeline.batch_import(urls)
    
    print(f"\n{'=' * 60}")
    print(f"Batch import complete!")
    print(f"  ✓ Successful: {len(successful)}")
    print(f"  ✗ Failed: {len(failed)}")
    
    if failed:
        print("\nFailed URLs:")
        for url in failed:
            print(f"  - {url}")
    
    return 0 if not failed else 1


def cmd_list_categories(args):
    """Handle 'list-categories' command."""
    # Known categories from Jamie Oliver website
    categories = [
        "chicken", "beef", "pork", "lamb", "fish",
        "vegetarian", "vegan", "pasta", "rice",
        "soup", "salad", "dessert", "cake", "bread",
        "breakfast", "curry", "stir-fry", "pie",
        "quick-and-easy", "healthy", "budget-friendly"
    ]
    
    print("Available recipe categories:")
    for cat in sorted(categories):
        print(f"  - {cat}")
    
    return 0


def cmd_enhance_existing(args):
    """Handle 'enhance-existing' command - enhance existing recipe files."""
    import re
    from pathlib import Path
    
    input_dir = Path(args.input_dir)
    if not input_dir.is_absolute():
        input_dir = Path(__file__).parent / args.input_dir
    
    output_dir = Path(args.output_dir) if args.output_dir else input_dir
    
    if not input_dir.exists():
        print(f"Input directory not found: {input_dir}", file=sys.stderr)
        return 1
    
    # Find all JSON files
    recipe_files = sorted(input_dir.glob("*.json"))
    
    # Filter by name pattern if specified
    if args.filter:
        pattern = args.filter.lower()
        recipe_files = [f for f in recipe_files if pattern in f.stem.lower()]
    
    print(f"Found {len(recipe_files)} recipe files in {input_dir}")
    
    if args.dry_run:
        print("\n[DRY RUN] Would enhance:")
        for f in recipe_files:
            print(f"  - {f.name}")
        return 0
    
    # Initialize enhancer and validator
    enhancer = RecipeEnhancer()
    validator = RecipeValidator()
    
    successful = []
    failed = []
    skipped = []
    
    for i, recipe_file in enumerate(recipe_files):
        print(f"\n[{i + 1}/{len(recipe_files)}] Processing: {recipe_file.name}")
        
        try:
            # Load recipe
            with open(recipe_file) as f:
                recipe_json = json.load(f)
            
            # Check if already enhanced (has semantic step IDs)
            if args.skip_enhanced:
                steps = recipe_json.get("steps", [])
                has_semantic_ids = all(
                    not re.match(r"^step[_-]?\d+$", s.get("id", s.get("step_id", "step_1")).lower())
                    for s in steps
                )
                if has_semantic_ids and len(steps) > 0:
                    print(f"  ⏭ Skipping (already enhanced)")
                    skipped.append(recipe_file.name)
                    continue
            
            # Enhance
            print(f"  🔄 Enhancing with LLM...")
            enhanced = enhancer.enhance(recipe_json)
            
            # Validate
            validation = validator.validate(enhanced)
            print(f"  ✓ Quality score: {validation.quality_score}")
            
            # Save
            output_file = output_dir / recipe_file.name
            with open(output_file, "w") as f:
                json.dump(enhanced, f, indent=2)
            print(f"  ✓ Saved to: {output_file.name}")
            
            # Publish if requested
            if args.publish:
                try:
                    upload_recipe(enhanced, publish=True)
                    print(f"  ✓ Published to Supabase")
                except Exception as e:
                    print(f"  ⚠ Upload failed: {e}")
            
            successful.append(recipe_file.name)
            
        except Exception as e:
            print(f"  ✗ Error: {e}")
            failed.append(recipe_file.name)
    
    print(f"\n{'=' * 60}")
    print(f"Enhancement complete!")
    print(f"  ✓ Successful: {len(successful)}")
    print(f"  ⏭ Skipped: {len(skipped)}")
    print(f"  ✗ Failed: {len(failed)}")
    
    if failed:
        print("\nFailed recipes:")
        for name in failed:
            print(f"  - {name}")
    
    return 0 if not failed else 1


def cmd_test(args):
    """Handle 'test' command - quick pipeline test."""
    test_url = args.url or "https://www.jamieoliver.com/recipes/mushroom/mushroom-risotto/"
    
    print(f"Testing pipeline with: {test_url}")
    print("-" * 60)
    
    # Just crawl and transform, no LLM
    pipeline = RecipePipeline(
        enhance=False,
        download_images=False,
        publish=False
    )
    
    try:
        # Crawl
        print("1. Crawling...")
        schema_recipe = pipeline.crawler.fetch_recipe(test_url)
        print(f"   ✓ Name: {schema_recipe.name}")
        print(f"   ✓ Ingredients: {len(schema_recipe.ingredients)}")
        print(f"   ✓ Steps: {len(schema_recipe.instructions)}")
        print(f"   ✓ Images: {len(schema_recipe.images)}")
        
        # Transform
        print("2. Transforming...")
        joa_recipe = pipeline.transformer.transform(schema_recipe)
        print(f"   ✓ ID: {joa_recipe.id}")
        print(f"   ✓ Servings: {joa_recipe.servings}")
        
        # Show sample step
        if joa_recipe.steps:
            print("\n3. Sample step:")
            step = joa_recipe.steps[0]
            print(f"   ID: {step.id}")
            print(f"   Type: {step.type.value}")
            print(f"   Description: {step.descr[:50]}...")
        
        # Show sample ingredient
        if joa_recipe.ingredients:
            print("\n4. Sample ingredient:")
            ing = joa_recipe.ingredients[0]
            print(f"   ID: {ing.id}")
            print(f"   Name: {ing.name}")
            print(f"   Quantity: {ing.quantity} {ing.unit or ''}")
        
        print("\n" + "-" * 60)
        print("✓ Pipeline test passed!")
        return 0
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        return 1


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Jamie Oliver AI Recipe Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Import command
    import_parser = subparsers.add_parser(
        "import",
        help="Import a single recipe from URL"
    )
    import_parser.add_argument(
        "--url", "-u",
        required=True,
        help="Jamie Oliver recipe URL"
    )
    import_parser.add_argument(
        "--enhance", "-e",
        action="store_true",
        help="Enhance recipe with LLM (requires OPENAI_API_KEY)"
    )
    import_parser.add_argument(
        "--publish", "-p",
        action="store_true",
        help="Publish to Supabase (requires SUPABASE_URL and key)"
    )
    import_parser.add_argument(
        "--no-images",
        action="store_true",
        help="Skip downloading images"
    )
    import_parser.set_defaults(func=cmd_import)
    
    # Batch import command
    batch_parser = subparsers.add_parser(
        "batch-import",
        help="Import multiple recipes from category or sitemap"
    )
    batch_parser.add_argument(
        "--category", "-c",
        help="Recipe category to import from (e.g., 'vegetarian')"
    )
    batch_parser.add_argument(
        "--limit", "-l",
        type=int,
        default=10,
        help="Maximum number of recipes to import"
    )
    batch_parser.add_argument(
        "--enhance", "-e",
        action="store_true",
        help="Enhance recipes with LLM"
    )
    batch_parser.add_argument(
        "--publish", "-p",
        action="store_true",
        help="Publish to Supabase"
    )
    batch_parser.add_argument(
        "--no-images",
        action="store_true",
        help="Skip downloading images"
    )
    batch_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List URLs without importing"
    )
    batch_parser.set_defaults(func=cmd_batch_import)
    
    # List categories command
    list_parser = subparsers.add_parser(
        "list-categories",
        help="List available recipe categories"
    )
    list_parser.set_defaults(func=cmd_list_categories)
    
    # Test command
    test_parser = subparsers.add_parser(
        "test",
        help="Test the pipeline with a sample recipe"
    )
    test_parser.add_argument(
        "--url", "-u",
        help="Optional URL to test with"
    )
    test_parser.set_defaults(func=cmd_test)
    
    # Enhance existing recipes command
    enhance_parser = subparsers.add_parser(
        "enhance-existing",
        help="Enhance existing recipe JSON files with LLM"
    )
    enhance_parser.add_argument(
        "--input-dir", "-i",
        default="../../../data/recipes",
        help="Directory containing recipe JSON files"
    )
    enhance_parser.add_argument(
        "--output-dir", "-o",
        help="Output directory (defaults to same as input)"
    )
    enhance_parser.add_argument(
        "--filter", "-f",
        help="Filter recipes by name pattern (e.g., 'risotto')"
    )
    enhance_parser.add_argument(
        "--skip-enhanced",
        action="store_true",
        help="Skip recipes that already have semantic step IDs"
    )
    enhance_parser.add_argument(
        "--publish", "-p",
        action="store_true",
        help="Publish enhanced recipes to Supabase"
    )
    enhance_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List recipes without enhancing"
    )
    enhance_parser.set_defaults(func=cmd_enhance_existing)
    
    # Parse args
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 0
    
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
