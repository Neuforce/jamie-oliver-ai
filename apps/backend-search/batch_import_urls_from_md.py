#!/usr/bin/env python3
"""
Read jamie-oliver-ai/docs/recipe-urls-top-251.md and import each URL with RecipePipeline.

Usage (from apps/backend-search):
  python batch_import_urls_from_md.py ../../docs/recipe-urls-top-251.md \\
    --output-dir ../../data/recipes --no-images
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
from pathlib import Path

# Ensure package imports work when run as script from apps/backend-search
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from recipe_pipeline.cli import RecipePipeline
from recipe_pipeline.crawler import CrawlerError, RecipeNotFoundError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("batch_import_md")

_URL_RE = re.compile(
    r"(https://www\.jamieoliver\.com/recipes/[^\s|)]+)",
    re.IGNORECASE,
)


def urls_from_markdown(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    seen: set[str] = set()
    out: list[str] = []
    for line in text.splitlines():
        m = _URL_RE.search(line)
        if not m:
            continue
        u = m.group(1).rstrip("/")
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch import Jamie Oliver URLs from Markdown table")
    parser.add_argument("markdown", type=Path, help="Path to recipe-urls-top-251.md")
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Directory for JSON files (e.g. ../../data/recipes)",
    )
    parser.add_argument(
        "--images",
        action="store_true",
        help="Download images (default: skip for speed)",
    )
    parser.add_argument(
        "--enhance",
        action="store_true",
        help="Run LLM enhance per recipe (slow)",
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Publish each recipe to Supabase during import (usually omit; use ingest_json_recipes)",
    )
    args = parser.parse_args()

    if not args.markdown.is_file():
        logger.error("Markdown file not found: %s", args.markdown)
        return 1

    urls = urls_from_markdown(args.markdown)
    if not urls:
        logger.error("No URLs found in %s", args.markdown)
        return 1

    out_dir = args.output_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Output directory: %s", out_dir)
    logger.info("URLs to import: %d", len(urls))

    pipeline = RecipePipeline(
        enhance=args.enhance,
        download_images=args.images,
        publish=args.publish,
        output_dir=out_dir,
    )

    ok = 0
    failed: list[str] = []
    for i, url in enumerate(urls, start=1):
        logger.info("[%d/%d] %s", i, len(urls), url)
        try:
            pipeline.import_recipe(url)
            ok += 1
        except (CrawlerError, RecipeNotFoundError) as e:
            logger.error("Failed %s: %s", url, e)
            failed.append(url)
        except Exception as e:
            logger.exception("Unexpected error %s: %s", url, e)
            failed.append(url)

    logger.info("Done. Success=%d Failed=%d", ok, len(failed))
    if failed:
        logger.warning("Failed URLs:\n%s", "\n".join(f"  - {u}" for u in failed))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
