#!/usr/bin/env python3
"""Test script to visualize intelligent chunks generated from PDF recipes.

This script processes a PDF recipe and displays the generated chunks in a readable format
without saving them to the database.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

from recipe_pdf_agent_llama.chunker import build_intelligent_chunks
from recipe_pdf_agent_llama.config import LlamaAgentConfig, load_config
from recipe_pdf_agent_llama.llama_structurer import build_joav0_json, understand_recipe
from recipe_pdf_agent_llama.pdf_extract import extract_raw_text
from recipe_pdf_agent_llama.supabase_store import SupabaseConfig, upsert_chunks

# ANSI color codes for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def print_header(text: str, char: str = "=") -> None:
    """Print a formatted header."""
    separator = char * 60
    print(f"\n{Colors.BOLD}{Colors.HEADER}{separator}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}{text}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}{separator}{Colors.ENDC}\n")


def print_chunk(chunk_num: int, total_chunks: int, chunk_data: dict[str, Any]) -> None:
    """Print a single chunk with formatted output."""
    chunk_text = chunk_data.get("chunk_text", "")
    search_intent = chunk_data.get("search_intent", "N/A")
    chunk_hash = chunk_data.get("chunk_hash", "N/A")
    llm_analysis = chunk_data.get("llm_analysis")
    
    print(f"{Colors.BOLD}{Colors.OKBLUE}Chunk {chunk_num}/{total_chunks}{Colors.ENDC}")
    print(f"{Colors.OKCYAN}{'─' * 60}{Colors.ENDC}")
    
    print(f"{Colors.BOLD}Search Intent:{Colors.ENDC} {Colors.OKGREEN}{search_intent}{Colors.ENDC}")
    print(f"{Colors.BOLD}Size:{Colors.ENDC} {len(chunk_text)} characters")
    print(f"{Colors.BOLD}Hash:{Colors.ENDC} {chunk_hash[:16]}...")
    
    if llm_analysis:
        print(f"{Colors.BOLD}LLM Analysis:{Colors.ENDC}")
        print(f"  {json.dumps(llm_analysis, indent=2, ensure_ascii=False)}")
    
    print(f"\n{Colors.BOLD}Text:{Colors.ENDC}")
    # Wrap text at 80 characters for better readability
    words = chunk_text.split()
    line = ""
    for word in words:
        if len(line) + len(word) + 1 <= 80:
            line += word + " "
        else:
            print(f"  {line.strip()}")
            line = word + " "
    if line:
        print(f"  {line.strip()}")
    print()


def print_statistics(chunks: list[dict[str, Any]]) -> None:
    """Print aggregate statistics about the chunks."""
    print_header("STATISTICS", "=")
    
    total = len(chunks)
    sizes = [len(c.get("chunk_text", "")) for c in chunks]
    avg_size = sum(sizes) / total if total > 0 else 0
    min_size = min(sizes) if sizes else 0
    max_size = max(sizes) if sizes else 0
    
    search_intents = [c.get("search_intent", "") for c in chunks if c.get("search_intent")]
    unique_intents = list(set(search_intents))
    
    print(f"{Colors.BOLD}Total chunks:{Colors.ENDC} {Colors.OKGREEN}{total}{Colors.ENDC}")
    print(f"{Colors.BOLD}Average size:{Colors.ENDC} {Colors.OKGREEN}{avg_size:.1f}{Colors.ENDC} characters")
    print(f"{Colors.BOLD}Min size:{Colors.ENDC} {Colors.OKGREEN}{min_size}{Colors.ENDC} characters")
    print(f"{Colors.BOLD}Max size:{Colors.ENDC} {Colors.OKGREEN}{max_size}{Colors.ENDC} characters")
    
    print(f"\n{Colors.BOLD}Search Intents ({len(unique_intents)}):{Colors.ENDC}")
    for i, intent in enumerate(unique_intents, 1):
        print(f"  {i}. {Colors.OKCYAN}{intent}{Colors.ENDC}")
    
    print()


def process_pdf_and_show_chunks(pdf_path: Path, cfg: LlamaAgentConfig) -> None:
    """Process a PDF and display the generated chunks."""
    
    if not pdf_path.exists():
        print(f"{Colors.FAIL}Error: PDF file not found: {pdf_path}{Colors.ENDC}", file=sys.stderr)
        sys.exit(1)
    
    print_header(f"Processing: {pdf_path.name}", "=")
    
    # Extract text from PDF
    print(f"{Colors.BOLD}Step 1: Extracting text from PDF...{Colors.ENDC}")
    raw_text = extract_raw_text(pdf_path)
    if not raw_text.strip():
        print(f"{Colors.FAIL}Error: PDF text extraction returned empty text{Colors.ENDC}", file=sys.stderr)
        sys.exit(1)
    print(f"{Colors.OKGREEN}✓ Extracted {len(raw_text)} characters{Colors.ENDC}")
    
    # Understand recipe
    print(f"\n{Colors.BOLD}Step 2: Understanding recipe with Llama...{Colors.ENDC}")
    print(f"{Colors.WARNING}(This may take 1-3 minutes for large prompts){Colors.ENDC}")
    try:
        understood = understand_recipe(cfg=cfg, raw_text=raw_text)
        print(f"{Colors.OKGREEN}✓ Recipe understood{Colors.ENDC}")
        if understood.get("title"):
            print(f"  Title: {Colors.OKCYAN}{understood['title']}{Colors.ENDC}")
    except Exception as e:
        print(f"{Colors.FAIL}Error understanding recipe: {e}{Colors.ENDC}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # Build JOAv0 structure
    print(f"\n{Colors.BOLD}Step 3: Building JOAv0 structure...{Colors.ENDC}")
    recipe_id = pdf_path.stem
    try:
        joav0_doc = build_joav0_json(
            cfg=cfg,
            recipe_id=recipe_id,
            raw_text=raw_text,
            source_file=str(pdf_path),
        )
        print(f"{Colors.OKGREEN}✓ JOAv0 document created{Colors.ENDC}")
    except Exception as e:
        print(f"{Colors.FAIL}Error building JOAv0: {e}{Colors.ENDC}", file=sys.stderr)
        sys.exit(1)
    
    # Generate chunks
    print(f"\n{Colors.BOLD}Step 4: Generating intelligent chunks...{Colors.ENDC}")
    try:
        chunks = build_intelligent_chunks(
            cfg=cfg,
            recipe_id=recipe_id,
            raw_text=raw_text,
            joav0_doc=joav0_doc,
        )
        print(f"{Colors.OKGREEN}✓ Generated {len(chunks)} chunks{Colors.ENDC}")
    except Exception as e:
        print(f"{Colors.FAIL}Error generating chunks: {e}{Colors.ENDC}", file=sys.stderr)
        sys.exit(1)
    
    # Display chunks
    print_header("CHUNKS", "=")
    for i, chunk in enumerate(chunks, 1):
        print_chunk(i, len(chunks), chunk)
    
    # Display statistics
    print_statistics(chunks)

    # Optionally persist to Supabase
    if not cfg.no_db:
        print_header("SUPABASE", "=")
        try:
            rows = []
            for ch in chunks:
                rows.append(
                    {
                        "recipe_id": recipe_id,
                        "chunk_text": ch.get("chunk_text"),
                        "chunk_hash": ch.get("chunk_hash"),
                        "search_intent": ch.get("search_intent"),
                        "llm_analysis": ch.get("llm_analysis"),
                        "embedding": None,  # embeddings not generated here
                        "file_path": str(pdf_path),
                        "file_hash": None,
                    }
                )
            upsert_chunks(
                cfg=SupabaseConfig(
                    url_env=cfg.supabase_url_env,
                    key_env=cfg.supabase_key_env,
                    table=cfg.chunks_table,
                ),
                rows=rows,
            )
            print(f"{Colors.OKGREEN}✓ Chunks upserted to Supabase table '{cfg.chunks_table}'{Colors.ENDC}")
        except Exception as e:
            print(f"{Colors.FAIL}Error saving to Supabase: {e}{Colors.ENDC}", file=sys.stderr)


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Test script to visualize intelligent chunks from PDF recipes",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process default PDF
  python test_chunks.py
  
  # Process specific PDF
  python test_chunks.py --pdf data/processed_pdfs/happy-fish-pie.pdf
  
  # Use different Ollama model
  python test_chunks.py --model llama3.2
        """,
    )
    
    parser.add_argument(
        "--pdf",
        type=Path,
        help="Path to PDF file to process (default: data/processed_pdfs/happy-fish-pie.pdf)",
    )
    
    parser.add_argument(
        "--model",
        type=str,
        help="Ollama model to use (default: llama3.2)",
    )
    
    parser.add_argument(
        "--ollama-url",
        type=str,
        help="Ollama base URL (default: http://localhost:11434)",
    )
    
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--save-to-db",
        action="store_true",
        help="Persist chunks to Supabase (intelligent_recipe_chunks table)",
    )
    
    args = parser.parse_args()
    
    # Setup logging
    log_level = logging.DEBUG if args.verbose else logging.WARNING
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    
    # Silence noisy loggers
    logging.getLogger("pdfminer").setLevel(logging.ERROR)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    
    # Load configuration
    cfg = load_config()
    
    # Override with CLI arguments
    from dataclasses import replace
    if args.model:
        cfg = replace(cfg, ollama_model=args.model)
    else:
        # Prefer faster model by default
        cfg = replace(cfg, ollama_model="llama3.2")
    
    if args.ollama_url:
        cfg = replace(cfg, ollama_base_url=args.ollama_url)
    
    from dataclasses import replace
    # If save-to-db is not passed, keep no_db True to avoid persistence
    cfg = replace(cfg, no_db=not args.save_to_db)
    
    # Determine PDF path
    if args.pdf:
        pdf_path = args.pdf
    else:
        # Default PDF
        project_root = Path(__file__).parent
        pdf_path = project_root / "data" / "processed_pdfs" / "happy-fish-pie.pdf"
    
    # Process and display
    try:
        process_pdf_and_show_chunks(pdf_path, cfg)
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}Interrupted by user{Colors.ENDC}")
        sys.exit(130)
    except Exception as e:
        print(f"\n{Colors.FAIL}Unexpected error: {e}{Colors.ENDC}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

