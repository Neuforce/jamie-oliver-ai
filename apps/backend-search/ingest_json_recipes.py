#!/usr/bin/env python3
"""
Ingest existing recipe JSON files into Supabase with embeddings.

Reads JSON files from data/recipes/ (monorepo root) and ingests into Supabase:
- Optionally enhances recipes with an LLM (--enhance)
- Generates semantic chunks
- Generates embeddings (384 dims)
- Persists to recipes, recipe_index, and intelligent_recipe_chunks
"""

import json
import logging
import os
import re
import sys
from hashlib import sha256
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# Ingest engine imports
from recipe_pdf_agent_llama.chunker_multiview import generate_multiview_chunks
from recipe_pdf_agent_llama.config import LlamaAgentConfig, load_config
from recipe_pdf_agent_llama.embed import embed_text
from recipe_pdf_agent_llama.supabase_store import SupabaseConfig, upsert_chunks
from recipe_pdf_agent.logging_utils import configure_logging

# Import enhancement components
from recipe_pipeline.enhancer import RecipeEnhancer
from recipe_pipeline.validator import RecipeValidator

# Load environment variables
project_root = Path(__file__).resolve().parent
load_dotenv(project_root / ".env")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def sanitize_json_for_postgres(obj):
    """Remove null characters that Postgres can't handle."""
    if isinstance(obj, str):
        return obj.replace('\x00', '').replace('\\u0000', '')
    elif isinstance(obj, dict):
        return {k: sanitize_json_for_postgres(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_json_for_postgres(item) for item in obj]
    return obj


def _sha256_file(path: Path) -> str:
    """Compute SHA256 hash of a file."""
    h = sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _detect_category_mood(recipe_doc: dict) -> tuple[str | None, str | None]:
    """
    Derive category and mood from the recipe JSON.
    Simplified version — you can improve this with an LLM if needed.
    """
    title = recipe_doc.get("recipe", {}).get("title", "").lower()
    category = None
    mood = None
    
    # Simple category detection
    if any(word in title for word in ["salad", "ensalada"]):
        category = "dinner"
    elif any(word in title for word in ["pasta", "spaghetti", "lasagna"]):
        category = "dinner"
    elif any(word in title for word in ["pie", "tart", "cake", "dessert"]):
        category = "dessert"
    elif any(word in title for word in ["soup", "stew", "curry"]):
        category = "dinner"
    else:
        category = "dinner"  # Default
    
    # Default mood
    mood = "comfort"
    
    return category, mood


def _category_mood_from_recipe_doc(recipe_doc: dict) -> tuple[str | None, str | None]:
    """Use recipe.categories[0] when present; else title heuristics."""
    recipe = recipe_doc.get("recipe") or {}
    cats = recipe.get("categories")
    heur_cat, mood = _detect_category_mood(recipe_doc)
    if isinstance(cats, list) and len(cats) > 0 and cats[0] is not None:
        raw = str(cats[0]).strip()
        if raw:
            return raw.lower(), mood
    return heur_cat, mood


def process_one_json(
    json_path: Path, 
    cfg: LlamaAgentConfig, 
    dry_run: bool = False,
    enhance: bool = False,
    publish: bool = False,
    enhancer: RecipeEnhancer = None,
    validator: RecipeValidator = None,
) -> bool:
    """
    Process one JSON file and ingest it into Supabase.

    Args:
        json_path: Path to the JSON file
        cfg: Agent configuration
        dry_run: If True, only log what would be done without saving
        enhance: If True, enhance the recipe with an LLM before saving
        publish: If True, publish the recipe immediately
        enhancer: RecipeEnhancer instance (reused across calls)
        validator: RecipeValidator instance (reused across calls)

    Returns:
        True on success, False on error
    """
    try:
        # Read JSON
        with json_path.open("r", encoding="utf-8") as f:
            recipe_doc = json.load(f)
        
        recipe_id = recipe_doc.get("recipe", {}).get("id")
        if not recipe_id:
            # Use filename as fallback
            recipe_id = json_path.stem
        
        title = recipe_doc.get("recipe", {}).get("title", recipe_id)
        logger.info(f"Processing: {title} ({recipe_id})")
        
        # Enhance with LLM if requested
        source_type = "imported"
        quality_score = None
        
        if enhance and enhancer:
            logger.info(f"  🤖 Enhancing with LLM...")
            try:
                recipe_doc = enhancer.enhance(recipe_doc)
                recipe_doc = sanitize_json_for_postgres(recipe_doc)
                source_type = "enhanced"
                logger.info(f"  ✅ Enhanced successfully")
            except Exception as e:
                logger.warning(f"  ⚠️ Enhancement failed, using original: {e}")
        
        # Validate
        if validator:
            validation = validator.validate(recipe_doc)
            quality_score = validation.quality_score
            logger.info(f"  Quality score: {quality_score}")
            if validation.warnings:
                for w in validation.warnings[:2]:
                    logger.warning(f"  ⚠️ {w}")
        
        # Compute file hash
        file_hash = _sha256_file(json_path)
        
        # Resolve category and mood
        category, mood = _category_mood_from_recipe_doc(recipe_doc)
        
        # Generate semantic chunks
        logger.info(f"  Generating chunks for {recipe_id}...")
        chunks = generate_multiview_chunks(
            recipe_id=recipe_id,
            joav0_doc=recipe_doc,
        )
        logger.info(f"  Generated {len(chunks)} chunks")
        
        if dry_run:
            logger.info(f"DRY RUN: Would process {len(chunks)} chunks for {recipe_id}")
            return True
        
        # Connect to Supabase
        supabase_url = os.getenv(cfg.supabase_url_env)
        supabase_key = os.getenv(cfg.supabase_key_env)
        
        if not supabase_url or not supabase_key:
            logger.error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
            return False
        
        client = create_client(supabase_url, supabase_key)
        
        # 0. Upsert recipes table (full recipe JSON — source of truth)
        recipe_meta = recipe_doc.get("recipe", {})
        steps = recipe_doc.get("steps", [])
        
        # Compute metadata for recipes table
        has_timers = any(s.get("type") == "timer" for s in steps)
        recipe_cats = recipe_meta.get("categories")
        if isinstance(recipe_cats, list) and recipe_cats:
            metadata_categories = [str(c).strip().lower() for c in recipe_cats if str(c).strip()]
        elif category:
            metadata_categories = [category]
        else:
            metadata_categories = []

        metadata = {
            "title": title,
            "description": recipe_meta.get("description"),
            "difficulty": recipe_meta.get("difficulty"),
            "servings": recipe_meta.get("servings"),
            "categories": metadata_categories,
            "moods": [mood] if mood else [],
            "step_count": len(steps),
            "has_timers": has_timers,
            "image_url": recipe_meta.get("image_url"),
        }
        
        recipes_row = {
            "slug": recipe_id,
            "recipe_json": recipe_doc,
            "metadata": metadata,
            "quality_score": quality_score,
            "source_type": source_type,
            "status": "published" if publish else "draft",
        }
        if publish:
            recipes_row["published_at"] = "now()"
        
        logger.info(f"  Upserting recipes table for {recipe_id}...")
        client.table("recipes").upsert(recipes_row, on_conflict="slug").execute()
        logger.info(f"  ✅ recipes table updated for {recipe_id}")
        
        # 1. Upsert recipe_index (basic metadata for search)
        recipe_row = {
            "id": recipe_id,
            "title": title,
            "category": category,
            "mood": mood,
            "complexity": recipe_doc.get("recipe", {}).get("difficulty") or None,
            "cost": None,
            "ingredients_text": "\n".join(
                i.get("name", "") for i in recipe_doc.get("ingredients", [])
            ),
            "file_path": str(json_path),
            "file_hash": file_hash,
        }
        
        logger.info(f"  Upserting recipe_index for {recipe_id}...")
        client.table("recipe_index").upsert(recipe_row).execute()
        logger.info(f"  ✅ recipe_index updated for {recipe_id}")
        
        # 2. Generar embeddings y upsert chunks
        chunk_rows = []
        for idx, chunk in enumerate(chunks, 1):
            chunk_text = chunk["chunk_text"]
            logger.info(f"    Generating embedding for chunk {idx}/{len(chunks)}...")
            
            embedding = embed_text(chunk_text, model_name=cfg.embedding_model)
            
            chunk_rows.append({
                "recipe_id": recipe_id,
                "chunk_text": chunk_text,
                "chunk_hash": chunk["chunk_hash"],
                "search_intent": chunk.get("search_intent"),
                "llm_analysis": chunk.get("llm_analysis"),
                "embedding": embedding,
                "file_path": str(json_path),
                "file_hash": file_hash,
            })
        
        _raw_chunk_count = len(chunk_rows)
        chunk_rows = list({row["chunk_hash"]: row for row in chunk_rows}.values())
        if len(chunk_rows) < _raw_chunk_count:
            logger.warning(
                "  Deduped %d chunks with duplicate chunk_hash → %d rows for upsert",
                _raw_chunk_count,
                len(chunk_rows),
            )
        
        # Upsert chunk rows
        logger.info(f"  Upserting {len(chunk_rows)} chunks for {recipe_id}...")
        upsert_chunks(
            cfg=SupabaseConfig(
                url_env=cfg.supabase_url_env,
                key_env=cfg.supabase_key_env,
                table=cfg.chunks_table,
            ),
            rows=chunk_rows,
        )
        logger.info(f"  ✅ {len(chunk_rows)} chunks ingested for {recipe_id}")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to process {json_path}: {e}", exc_info=True)
        return False


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Ingest recipe JSON files into Supabase")
    parser.add_argument(
        "json_dir",
        type=Path,
        help="Directory containing recipe JSON files",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without writing to the database",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-process recipes that already exist",
    )
    parser.add_argument(
        "--enhance",
        "-e",
        action="store_true",
        help="Enhance recipes with LLM (adds Jamie Oliver voice, semantic step IDs, timer detection)",
    )
    parser.add_argument(
        "--publish",
        "-p",
        action="store_true",
        help="Publish recipes immediately (otherwise saved as draft)",
    )
    
    args = parser.parse_args()
    
    if not args.json_dir.exists() or not args.json_dir.is_dir():
        logger.error(f"Directory not found: {args.json_dir}")
        return 1
    
    # Load configuration
    cfg = load_config()
    configure_logging(cfg.log_level)
    
    # Initialize enhancer and validator if enhancement is enabled
    enhancer = None
    validator = RecipeValidator()
    
    if args.enhance:
        logger.info("🤖 Enhancement enabled - recipes will be processed with LLM")
        enhancer = RecipeEnhancer()
    
    # Collect JSON files
    json_files = sorted(
        p for p in args.json_dir.iterdir()
        if p.is_file() and p.suffix.lower() == ".json"
    )
    
    if not json_files:
        logger.warning(f"No JSON files found in {args.json_dir}")
        return 1
    
    logger.info(f"Found {len(json_files)} JSON files to process")
    
    # Skip recipes that already exist in Supabase (unless --overwrite)
    if not args.overwrite and not args.dry_run:
        supabase_url = os.getenv(cfg.supabase_url_env)
        supabase_key = os.getenv(cfg.supabase_key_env)
        
        if supabase_url and supabase_key:
            client = create_client(supabase_url, supabase_key)
            existing_recipes = client.table("recipe_index").select("id").execute()
            existing_ids = {r["id"] for r in existing_recipes.data}
            
            # Drop recipes that already exist
            json_files = [
                f for f in json_files
                if f.stem not in existing_ids
            ]
            logger.info(f"After filtering existing recipes: {len(json_files)} to process")
    
    # Process each JSON file
    success_count = 0
    error_count = 0
    
    for json_file in json_files:
        if process_one_json(
            json_file, 
            cfg, 
            dry_run=args.dry_run,
            enhance=args.enhance,
            publish=args.publish,
            enhancer=enhancer,
            validator=validator,
        ):
            success_count += 1
        else:
            error_count += 1
    
    logger.info("=" * 80)
    logger.info(f"Processing complete:")
    logger.info(f"  ✅ Success: {success_count}")
    logger.info(f"  ❌ Errors: {error_count}")
    logger.info(f"  📊 Total: {len(json_files)}")
    if args.enhance:
        logger.info(f"  🤖 Enhancement: ENABLED")
    if args.publish:
        logger.info(f"  📢 Published: YES")
    else:
        logger.info(f"  📋 Status: DRAFT (use --publish to publish)")
    logger.info("=" * 80)
    
    return 0 if error_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
