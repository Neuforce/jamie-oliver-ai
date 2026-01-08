#!/usr/bin/env python3
"""Test script to validate chunker with existing JSON."""

import json
import sys
import time
from pathlib import Path

from recipe_pdf_agent_llama.chunker import build_intelligent_chunks
from recipe_pdf_agent_llama.config import load_config


def test_chunker(json_path: str, model: str = "llama3.2", enable_density: bool = None, enable_enrichment: bool = None):
    """Test chunker with a specific recipe JSON."""
    
    # Load the JSON
    json_file = Path(json_path)
    if not json_file.exists():
        print(f"❌ File not found: {json_path}")
        sys.exit(1)
    
    with open(json_file, "r", encoding="utf-8") as f:
        joav0_doc = json.load(f)
    
    recipe_id = joav0_doc["recipe"]["id"]
    title = joav0_doc["recipe"]["title"]
    
    # Load config from .env
    cfg = load_config()
    
    # Override model if specified
    if model:
        from dataclasses import replace
        cfg = replace(cfg, ollama_model=model)
    
    # Override density/enrichment flags if specified
    if enable_density is not None:
        from dataclasses import replace
        cfg = replace(cfg, enable_density_optimization=enable_density)
    if enable_enrichment is not None:
        from dataclasses import replace
        cfg = replace(cfg, enable_llm_enrichment=enable_enrichment)
    
    print(f"\n{'='*60}")
    print(f"Testing Chunker")
    print(f"{'='*60}")
    print(f"Recipe: {title} ({recipe_id})")
    print(f"Model: {model}")
    print(f"Ingredients: {len(joav0_doc['ingredients'])}")
    print(f"Steps: {len(joav0_doc['steps'])}")
    print(f"Density Optimization: {'✅ ENABLED' if cfg.enable_density_optimization else '❌ disabled'}")
    print(f"LLM Enrichment: {'✅ ENABLED' if cfg.enable_llm_enrichment else '❌ disabled'}")
    print(f"{'='*60}\n")
    
    # Call chunker
    print("🔄 Generating chunks...\n")
    start = time.time()
    
    try:
        chunks = build_intelligent_chunks(
            cfg=cfg,
            recipe_id=recipe_id,
            clean_text="",  # Not used anymore
            joav0_doc=joav0_doc,
        )
        elapsed = time.time() - start
        
        print(f"✅ Success! Generated {len(chunks)} chunks in {elapsed:.2f}s\n")
        print(f"{'='*60}")
        print("Chunks:")
        print(f"{'='*60}\n")
        
        for i, chunk in enumerate(chunks, 1):
            print(f"Chunk {i}:")
            print(f"  Text: {chunk['chunk_text']}")
            print(f"  Intent: {chunk.get('search_intent', 'N/A')}")
            print(f"  Analysis: {chunk.get('llm_analysis', {})}")
            print()
        
        # Show statistics
        print(f"{'='*60}")
        print("Statistics:")
        print(f"{'='*60}")
        print(f"Total chunks: {len(chunks)}")
        
        chunk_lengths = [len(c['chunk_text']) for c in chunks]
        print(f"Avg chunk length: {sum(chunk_lengths) / len(chunks):.0f} chars")
        print(f"Min chunk length: {min(chunk_lengths)} chars")
        print(f"Max chunk length: {max(chunk_lengths)} chars")
        
        print(f"Processing time: {elapsed:.2f}s")
        print(f"Time per chunk: {elapsed / len(chunks):.2f}s")
        
        # If enrichment was enabled, show metadata stats
        enriched_chunks = [c for c in chunks if c.get('llm_analysis')]
        if enriched_chunks:
            print(f"\nEnriched chunks: {len(enriched_chunks)}/{len(chunks)}")
            
            # Count metadata types
            metadata_keys = set()
            for c in enriched_chunks:
                metadata_keys.update(c.get('llm_analysis', {}).keys())
            print(f"Metadata fields: {', '.join(sorted(metadata_keys))}")
        
        return chunks
        
    except Exception as e:
        elapsed = time.time() - start
        print(f"❌ Failed after {elapsed:.2f}s")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test chunker with existing recipe JSON")
    parser.add_argument(
        "--json",
        default="data/recipes_json/christmas-salad-jamie-oliver-recipes.json",
        help="Path to recipe JSON file",
    )
    parser.add_argument(
        "--model",
        default="llama3.2",
        choices=["llama3.1", "llama3.2"],
        help="Ollama model to use",
    )
    parser.add_argument(
        "--enable-density",
        action="store_true",
        help="Enable density optimization (overrides .env)",
    )
    parser.add_argument(
        "--enable-enrichment",
        action="store_true",
        help="Enable LLM enrichment (overrides .env)",
    )
    parser.add_argument(
        "--disable-density",
        action="store_true",
        help="Disable density optimization (overrides .env)",
    )
    parser.add_argument(
        "--disable-enrichment",
        action="store_true",
        help="Disable LLM enrichment (overrides .env)",
    )
    
    args = parser.parse_args()
    
    # Parse density flag
    enable_density = None
    if args.enable_density:
        enable_density = True
    elif args.disable_density:
        enable_density = False
    
    # Parse enrichment flag
    enable_enrichment = None
    if args.enable_enrichment:
        enable_enrichment = True
    elif args.disable_enrichment:
        enable_enrichment = False
    
    test_chunker(args.json, args.model, enable_density, enable_enrichment)

