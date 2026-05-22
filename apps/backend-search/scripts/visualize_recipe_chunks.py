#!/usr/bin/env python3
"""
Visualize recipe chunks from a PDF through the full ingestion pipeline.

Manual dev tool — not a pytest test. Requires Ollama and optionally Supabase.

Usage:
    python scripts/visualize_recipe_chunks.py
    python scripts/visualize_recipe_chunks.py --pdf data/processed_pdfs/happy-fish-pie.pdf
    python scripts/visualize_recipe_chunks.py --model llama3.2 --verbose
"""

import argparse
import sys
import time
from pathlib import Path

from recipe_pdf_agent_llama.chunker import build_intelligent_chunks
from recipe_pdf_agent_llama.config import load_config
from recipe_pdf_agent_llama.llama_structurer import build_clean_and_joav0
from recipe_pdf_agent_llama.pdf_extractor import extract_text_from_pdf
from recipe_pdf_agent_llama.supabase_client import SupabaseClient


class Colors:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"


def print_header(text: str) -> None:
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'=' * 80}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(80)}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'=' * 80}{Colors.ENDC}\n")


def print_section(title: str) -> None:
    print(f"\n{Colors.CYAN}{Colors.BOLD}▶ {title}{Colors.ENDC}")
    print(f"{Colors.CYAN}{'─' * 80}{Colors.ENDC}")


def print_chunk(chunk: dict, index: int, verbose: bool = False) -> None:
    print(f"\n{Colors.GREEN}{Colors.BOLD}Chunk #{index}{Colors.ENDC}")
    print(f"  {Colors.BOLD}ID:{Colors.ENDC} {chunk['id']}")
    print(f"  {Colors.BOLD}Type:{Colors.ENDC} {Colors.YELLOW}{chunk['type']}{Colors.ENDC}")
    print(f"  {Colors.BOLD}Step ID:{Colors.ENDC} {chunk.get('step_id', 'N/A')}")
    print(f"  {Colors.BOLD}Text:{Colors.ENDC} {chunk['text'][:100]}{'...' if len(chunk['text']) > 100 else ''}")

    if verbose:
        print(f"  {Colors.BOLD}Full Text:{Colors.ENDC}\n    {chunk['text']}")
        if chunk.get("metadata"):
            print(f"  {Colors.BOLD}Metadata:{Colors.ENDC}")
            for key, value in chunk["metadata"].items():
                print(f"    {key}: {value}")


def test_pdf_chunks(
    pdf_path: str,
    model: str = "llama3.2",
    verbose: bool = False,
    skip_supabase: bool = False,
) -> None:
    """Run PDF → clean/JOAv0 → chunks and print results."""
    start_time = time.time()

    print_header("RECIPE CHUNK VISUALIZER")

    pdf_file = Path(pdf_path)
    if not pdf_file.exists():
        print(f"{Colors.RED}❌ PDF not found: {pdf_path}{Colors.ENDC}")
        sys.exit(1)

    print(f"{Colors.BOLD}PDF:{Colors.ENDC} {pdf_file.name}")
    print(f"{Colors.BOLD}Model:{Colors.ENDC} {model}")
    print(f"{Colors.BOLD}Size:{Colors.ENDC} {pdf_file.stat().st_size / 1024:.1f} KB")

    cfg = load_config()
    cfg.ollama_model = model

    print_section("Step 1: Extracting text from PDF")
    step_start = time.time()
    raw_text = extract_text_from_pdf(str(pdf_file))
    print(f"{Colors.GREEN}✓ Extracted {len(raw_text)} characters{Colors.ENDC}")
    print(f"  Time: {time.time() - step_start:.2f}s")

    if verbose:
        print(f"\n{Colors.BOLD}Raw text preview:{Colors.ENDC}")
        print(f"  {raw_text[:500]}...")

    recipe_id = pdf_file.stem

    print_section("Step 2: Building clean text and JOAv0 structure")
    step_start = time.time()
    clean_text, joav0_doc = build_clean_and_joav0(
        cfg=cfg,
        recipe_id=recipe_id,
        raw_text=raw_text,
        source_file=str(pdf_file),
    )
    title = joav0_doc.get("recipe", {}).get("title", "Unknown")
    print(f"{Colors.GREEN}✓ Recipe: {title}{Colors.ENDC}")
    print(f"  Clean text: {len(clean_text)} characters")
    print(f"  Ingredients: {len(joav0_doc.get('ingredients', []))}")
    print(f"  Steps: {len(joav0_doc.get('steps', []))}")
    print(f"  Time: {time.time() - step_start:.2f}s")

    print_section("Step 3: Building intelligent chunks")
    step_start = time.time()
    chunks = build_intelligent_chunks(
        cfg=cfg,
        recipe_id=recipe_id,
        clean_text=clean_text,
        joav0_doc=joav0_doc,
    )
    print(f"{Colors.GREEN}✓ Generated {len(chunks)} chunks{Colors.ENDC}")
    print(f"  Time: {time.time() - step_start:.2f}s")

    print_section("Chunk Details")
    chunk_types: dict[str, int] = {}
    for i, chunk in enumerate(chunks, 1):
        chunk_type = chunk.get("type", "unknown")
        chunk_types[chunk_type] = chunk_types.get(chunk_type, 0) + 1
        print_chunk(chunk, i, verbose)

    print_section("Summary Statistics")
    print(f"{Colors.BOLD}Total chunks:{Colors.ENDC} {len(chunks)}")
    print(f"\n{Colors.BOLD}By type:{Colors.ENDC}")
    for chunk_type, count in sorted(chunk_types.items()):
        print(f"  {chunk_type}: {count}")

    if not skip_supabase:
        print_section("Step 4: Testing Supabase connection (optional)")
        try:
            supabase = SupabaseClient(cfg)
            print(f"{Colors.GREEN}✓ Supabase client initialized{Colors.ENDC}")
            print(f"  URL: {cfg.supabase_url}")
        except Exception as e:
            print(f"{Colors.YELLOW}⚠ Supabase not configured: {e}{Colors.ENDC}")
            print(f"  {Colors.YELLOW}This is OK for local testing{Colors.ENDC}")

    total_time = time.time() - start_time
    print_header("TEST COMPLETE")
    print(f"{Colors.BOLD}Total time:{Colors.ENDC} {total_time:.2f}s")
    print(f"{Colors.BOLD}Average per chunk:{Colors.ENDC} {total_time / len(chunks):.2f}s\n")


def main() -> None:
    backend_root = Path(__file__).resolve().parent.parent
    default_pdf = backend_root / "data" / "processed_pdfs" / "happy-fish-pie.pdf"

    parser = argparse.ArgumentParser(
        description="Visualize recipe chunks from a PDF (manual dev tool, not pytest)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/visualize_recipe_chunks.py
  python scripts/visualize_recipe_chunks.py --pdf data/processed_pdfs/happy-fish-pie.pdf
  python scripts/visualize_recipe_chunks.py --model llama3.2 --verbose
        """,
    )
    parser.add_argument(
        "--pdf",
        type=str,
        default=str(default_pdf),
        help=f"Path to PDF file (default: {default_pdf.name})",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="llama3.2",
        help="Ollama model to use (default: llama3.2)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed output including full chunk text",
    )
    parser.add_argument(
        "--skip-supabase",
        action="store_true",
        help="Skip Supabase connection test",
    )

    args = parser.parse_args()
    test_pdf_chunks(
        pdf_path=args.pdf,
        model=args.model,
        verbose=args.verbose,
        skip_supabase=args.skip_supabase,
    )


if __name__ == "__main__":
    main()
