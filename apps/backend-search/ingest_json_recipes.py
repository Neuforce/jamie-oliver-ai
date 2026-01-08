#!/usr/bin/env python3
"""
Script para ingerir recetas JSON existentes a Supabase con embeddings.

Lee los JSONs de data/recipes/ (monorepo root) y los ingiere a Supabase:
- Genera chunks semánticos
- Genera embeddings (384 dims)
- Guarda en recipe_index e intelligent_recipe_chunks
"""

import json
import logging
import os
import sys
from hashlib import sha256
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# Importar funciones del motor de ingestión
from recipe_pdf_agent_llama.chunker_multiview import generate_multiview_chunks
from recipe_pdf_agent_llama.config import LlamaAgentConfig, load_config
from recipe_pdf_agent_llama.embed import embed_text
from recipe_pdf_agent_llama.supabase_store import SupabaseConfig, upsert_chunks
from recipe_pdf_agent.logging_utils import configure_logging

# Cargar variables de entorno
project_root = Path(__file__).resolve().parent
load_dotenv(project_root / ".env")

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _sha256_file(path: Path) -> str:
    """Calcular hash SHA256 de un archivo."""
    h = sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _detect_category_mood(recipe_doc: dict) -> tuple[str | None, str | None]:
    """
    Detectar category y mood desde el JSON de la receta.
    Versión simplificada - puedes mejorarla con LLM si es necesario.
    """
    title = recipe_doc.get("recipe", {}).get("title", "").lower()
    category = None
    mood = None
    
    # Detección simple de categoría
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
    
    # Mood por defecto
    mood = "comfort"
    
    return category, mood


def process_one_json(json_path: Path, cfg: LlamaAgentConfig, dry_run: bool = False) -> bool:
    """
    Procesa un archivo JSON y lo ingiere a Supabase.
    
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
        
        recipe_id = recipe_doc.get("recipe", {}).get("id")
        if not recipe_id:
            # Usar nombre del archivo como fallback
            recipe_id = json_path.stem
        
        title = recipe_doc.get("recipe", {}).get("title", recipe_id)
        logger.info(f"Processing: {title} ({recipe_id})")
        
        # Calcular hash del archivo
        file_hash = _sha256_file(json_path)
        
        # Detectar category y mood
        category, mood = _detect_category_mood(recipe_doc)
        
        # Generar chunks semánticos
        logger.info(f"Generating chunks for {recipe_id}...")
        chunks = generate_multiview_chunks(
            recipe_id=recipe_id,
            joav0_doc=recipe_doc,
        )
        logger.info(f"Generated {len(chunks)} chunks")
        
        if dry_run:
            logger.info(f"DRY RUN: Would process {len(chunks)} chunks for {recipe_id}")
            return True
        
        # Conectar a Supabase
        supabase_url = os.getenv(cfg.supabase_url_env)
        supabase_key = os.getenv(cfg.supabase_key_env)
        
        if not supabase_url or not supabase_key:
            logger.error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
            return False
        
        client = create_client(supabase_url, supabase_key)
        
        # 1. Upsert en recipe_index (metadata básica)
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
        
        logger.info(f"Upserting recipe_index for {recipe_id}...")
        client.table("recipe_index").upsert(recipe_row).execute()
        logger.info(f"✅ recipe_index updated for {recipe_id}")
        
        # 2. Generar embeddings y upsert chunks
        chunk_rows = []
        for idx, chunk in enumerate(chunks, 1):
            chunk_text = chunk["chunk_text"]
            logger.info(f"  Generating embedding for chunk {idx}/{len(chunks)}...")
            
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
        
        # Upsert chunks
        logger.info(f"Upserting {len(chunk_rows)} chunks for {recipe_id}...")
        upsert_chunks(
            cfg=SupabaseConfig(
                url_env=cfg.supabase_url_env,
                key_env=cfg.supabase_key_env,
                table=cfg.chunks_table,
            ),
            rows=chunk_rows,
        )
        logger.info(f"✅ {len(chunk_rows)} chunks ingested for {recipe_id}")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to process {json_path}: {e}", exc_info=True)
        return False


def main():
    """Función principal."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Ingerir recetas JSON a Supabase")
    parser.add_argument(
        "json_dir",
        type=Path,
        help="Directorio con archivos JSON de recetas",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo mostrar lo que haría sin guardar",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-procesar recetas que ya existen",
    )
    
    args = parser.parse_args()
    
    if not args.json_dir.exists() or not args.json_dir.is_dir():
        logger.error(f"Directory not found: {args.json_dir}")
        return 1
    
    # Cargar configuración
    cfg = load_config()
    configure_logging(cfg.log_level)
    
    # Buscar archivos JSON
    json_files = sorted(
        p for p in args.json_dir.iterdir()
        if p.is_file() and p.suffix.lower() == ".json"
    )
    
    if not json_files:
        logger.warning(f"No JSON files found in {args.json_dir}")
        return 1
    
    logger.info(f"Found {len(json_files)} JSON files to process")
    
    # Verificar si ya existen en Supabase (si no es overwrite)
    if not args.overwrite and not args.dry_run:
        supabase_url = os.getenv(cfg.supabase_url_env)
        supabase_key = os.getenv(cfg.supabase_key_env)
        
        if supabase_url and supabase_key:
            client = create_client(supabase_url, supabase_key)
            existing_recipes = client.table("recipe_index").select("id").execute()
            existing_ids = {r["id"] for r in existing_recipes.data}
            
            # Filtrar recetas que ya existen
            json_files = [
                f for f in json_files
                if f.stem not in existing_ids
            ]
            logger.info(f"After filtering existing recipes: {len(json_files)} to process")
    
    # Procesar cada JSON
    success_count = 0
    error_count = 0
    
    for json_file in json_files:
        if process_one_json(json_file, cfg, dry_run=args.dry_run):
            success_count += 1
        else:
            error_count += 1
    
    logger.info("=" * 80)
    logger.info(f"Processing complete:")
    logger.info(f"  ✅ Success: {success_count}")
    logger.info(f"  ❌ Errors: {error_count}")
    logger.info(f"  📊 Total: {len(json_files)}")
    logger.info("=" * 80)
    
    return 0 if error_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
