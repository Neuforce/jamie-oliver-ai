"""CLI entrypoint for recipe PDF ingestion.

Commands:
  recipe-pdf run <pdf_dir>
  recipe-pdf watch <pdf_dir>
  recipe-pdf validate <json_file>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from recipe_pdf_agent.config import AgentConfig, load_config
from recipe_pdf_agent.logging_utils import configure_logging
from recipe_pdf_agent.pipeline import run_batch, run_watch
from recipe_pdf_agent.validate import validate_json_file


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="recipe-pdf")
    sub = p.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="Batch-process all PDFs currently in <pdf_dir>.")
    run.add_argument("pdf_dir", type=Path)
    run.add_argument("--dry-run", action="store_true")
    run.add_argument("--no-db", action="store_true")
    run.add_argument("--overwrite", action="store_true")

    watch = sub.add_parser("watch", help="Watch <pdf_dir> and process new/updated PDFs.")
    watch.add_argument("pdf_dir", type=Path)
    watch.add_argument("--dry-run", action="store_true")
    watch.add_argument("--no-db", action="store_true")
    watch.add_argument("--overwrite", action="store_true")

    validate = sub.add_parser("validate", help="Validate a JOAv0 recipe JSON file.")
    validate.add_argument("json_file", type=Path)

    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    cfg: AgentConfig = load_config()
    configure_logging(cfg.log_level)

    if args.cmd == "validate":
        ok, errors = validate_json_file(args.json_file, cfg.schema_path)
        if ok:
            print("OK")
            return 0
        print("INVALID")
        for e in errors:
            print(f"- {e}")
        return 2

    # run / watch
    pdf_dir: Path = args.pdf_dir
    if not pdf_dir.exists() or not pdf_dir.is_dir():
        print(f"ERROR: {pdf_dir} is not a directory", file=sys.stderr)
        return 2

    cfg = cfg.with_overrides(
        input_dir=pdf_dir,
        dry_run=bool(args.dry_run),
        no_db=bool(args.no_db),
        overwrite=bool(args.overwrite),
    )

    if args.cmd == "run":
        return 0 if run_batch(cfg) else 1
    if args.cmd == "watch":
        return 0 if run_watch(cfg) else 1

    return 2


if __name__ == "__main__":
    raise SystemExit(main())


