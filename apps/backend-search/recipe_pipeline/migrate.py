#!/usr/bin/env python3
"""
Recipe Migration Script

Migrates existing recipe JSONs to Supabase with optional enhancement.

Usage:
    python -m recipe_pipeline.migrate --source-dir ../../data/recipes
    python -m recipe_pipeline.migrate --source-dir ../../data/recipes --enhance --publish
    python -m recipe_pipeline.migrate --single path/to/recipe.json --enhance
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from .enhancer import RecipeEnhancer
from .validator import RecipeValidator
from .uploader import RecipeUploader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def process_recipe(
    json_path: Path,
    enhancer: RecipeEnhancer | None,
    validator: RecipeValidator,
    uploader: RecipeUploader,
    publish: bool = False,
    dry_run: bool = False,
) -> dict:
    """
    Process a single recipe file.
    
    Args:
        json_path: Path to recipe JSON file
        enhancer: Optional enhancer for LLM enhancement
        validator: Validator instance
        uploader: Uploader instance
        publish: Whether to publish after upload
        dry_run: If True, don't actually upload
        
    Returns:
        Result dict with status and details
    """
    logger.info(f"Processing: {json_path.name}")
    
    # Load JSON
    try:
        with json_path.open("r", encoding="utf-8") as f:
            recipe_json = json.load(f)
    except Exception as e:
        return {"status": "error", "file": str(json_path), "error": f"Failed to load: {e}"}
    
    # Get slug from filename or recipe ID
    slug = json_path.stem
    recipe_id = recipe_json.get("recipe", {}).get("id")
    if recipe_id:
        slug = recipe_id
    
    title = recipe_json.get("recipe", {}).get("title", slug)
    logger.info(f"  Title: {title}")
    
    # Validate before enhancement
    pre_validation = validator.validate(recipe_json)
    logger.info(f"  Pre-enhancement score: {pre_validation.quality_score}/100")
    
    # Enhance if requested
    if enhancer:
        logger.info("  Enhancing with LLM...")
        recipe_json = enhancer.enhance(recipe_json)
        
        # Validate after enhancement
        post_validation = validator.validate(recipe_json)
        logger.info(f"  Post-enhancement score: {post_validation.quality_score}/100")
        validation = post_validation
    else:
        validation = pre_validation
    
    # Log validation issues
    if validation.warnings:
        for warning in validation.warnings[:3]:  # Show first 3
            logger.warning(f"  ⚠️  {warning}")
    
    if validation.errors:
        for error in validation.errors:
            logger.error(f"  ❌ {error}")
    
    if dry_run:
        logger.info(f"  DRY RUN: Would upload {slug} (score: {validation.quality_score})")
        return {
            "status": "dry_run",
            "slug": slug,
            "title": title,
            "quality_score": validation.quality_score,
            "is_valid": validation.is_valid,
        }
    
    # Upload to Supabase
    try:
        result = uploader.upload(
            slug=slug,
            recipe_json=recipe_json,
            validation=validation,
            source_type="enhanced" if enhancer else "imported",
            publish=publish,
        )
        
        logger.info(f"  ✅ Uploaded: {slug} (score: {validation.quality_score})")
        return {
            "status": "success",
            "slug": slug,
            "title": title,
            "quality_score": validation.quality_score,
            "published": publish,
        }
        
    except Exception as e:
        logger.error(f"  ❌ Upload failed: {e}")
        return {"status": "error", "slug": slug, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(
        description="Migrate recipe JSONs to Supabase with optional enhancement"
    )
    
    parser.add_argument(
        "--source-dir",
        type=Path,
        help="Directory containing recipe JSON files",
    )
    
    parser.add_argument(
        "--single",
        type=Path,
        help="Process a single recipe file",
    )
    
    parser.add_argument(
        "--enhance",
        action="store_true",
        help="Enhance recipes with LLM (adds on_enter.say, semantic IDs, etc.)",
    )
    
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Publish recipes after upload (default: draft)",
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and enhance but don't upload",
    )
    
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip recipes that already exist in Supabase",
    )
    
    parser.add_argument(
        "--min-quality",
        type=int,
        default=0,
        help="Only upload recipes with quality score >= this value",
    )
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.source_dir and not args.single:
        parser.error("Either --source-dir or --single is required")
    
    # Initialize components
    validator = RecipeValidator()
    
    enhancer = None
    if args.enhance:
        if not os.getenv("OPENAI_API_KEY"):
            logger.error("OPENAI_API_KEY required for --enhance")
            return 1
        enhancer = RecipeEnhancer()
        logger.info("LLM enhancement enabled")
    
    uploader = None
    if not args.dry_run:
        try:
            uploader = RecipeUploader()
        except ValueError as e:
            logger.error(f"Failed to initialize uploader: {e}")
            return 1
    
    # Get list of existing recipes if skipping
    existing_slugs = set()
    if args.skip_existing and uploader:
        existing = uploader.list_recipes(status="published", limit=500)
        existing_slugs = {r["slug"] for r in existing}
        existing_drafts = uploader.list_recipes(status="draft", limit=500)
        existing_slugs.update(r["slug"] for r in existing_drafts)
        logger.info(f"Found {len(existing_slugs)} existing recipes to skip")
    
    # Collect files to process
    if args.single:
        json_files = [args.single]
    else:
        json_files = sorted(
            p for p in args.source_dir.iterdir()
            if p.is_file() and p.suffix.lower() == ".json"
        )
    
    if not json_files:
        logger.warning("No JSON files found")
        return 1
    
    logger.info(f"Found {len(json_files)} recipe files")
    
    # Process each recipe
    results = {
        "success": [],
        "error": [],
        "skipped": [],
        "dry_run": [],
    }
    
    for json_path in json_files:
        slug = json_path.stem
        
        # Skip if exists
        if slug in existing_slugs:
            logger.info(f"Skipping existing: {slug}")
            results["skipped"].append(slug)
            continue
        
        result = process_recipe(
            json_path=json_path,
            enhancer=enhancer,
            validator=validator,
            uploader=uploader,
            publish=args.publish,
            dry_run=args.dry_run,
        )
        
        # Filter by quality
        if result.get("quality_score", 0) < args.min_quality:
            logger.info(f"  Skipping due to low quality: {result.get('quality_score')}")
            results["skipped"].append(result.get("slug", slug))
            continue
        
        results[result["status"]].append(result)
    
    # Print summary
    print("\n" + "=" * 60)
    print("MIGRATION SUMMARY")
    print("=" * 60)
    print(f"✅ Success:  {len(results['success'])}")
    print(f"❌ Errors:   {len(results['error'])}")
    print(f"⏭️  Skipped:  {len(results['skipped'])}")
    if args.dry_run:
        print(f"🔍 Dry run:  {len(results['dry_run'])}")
    print("=" * 60)
    
    # Show quality scores
    if results["success"] or results["dry_run"]:
        all_processed = results["success"] + results["dry_run"]
        scores = [r["quality_score"] for r in all_processed if "quality_score" in r]
        if scores:
            print(f"\nQuality Scores:")
            print(f"  Average: {sum(scores) / len(scores):.1f}")
            print(f"  Min: {min(scores)}")
            print(f"  Max: {max(scores)}")
    
    # Show errors
    if results["error"]:
        print("\nErrors:")
        for err in results["error"]:
            print(f"  - {err.get('slug', err.get('file'))}: {err.get('error')}")
    
    return 0 if not results["error"] else 1


if __name__ == "__main__":
    sys.exit(main())
