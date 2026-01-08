"""Orchestration pipeline for PDF -> JSON -> embedding -> Supabase."""

from __future__ import annotations

import json
import logging
import shutil
import time
from dataclasses import asdict
from hashlib import sha256
from pathlib import Path

from recipe_pdf_agent.config import AgentConfig
from recipe_pdf_agent.embed import embed_text
from recipe_pdf_agent.kebabcase import to_kebab_case
from recipe_pdf_agent.pdf_extract import extract_text_from_pdf
from recipe_pdf_agent.parse_heuristics import parse_recipe_from_text
from recipe_pdf_agent.supabase_store import SupabaseConfig, upsert_recipe_index_row
from recipe_pdf_agent.validate import validate_json_data


logger = logging.getLogger(__name__)


def _sha256_file(path: Path) -> str:
    h = sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _safe_mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _rename_to_kebab(pdf_path: Path) -> Path:
    stem = to_kebab_case(pdf_path.stem)
    target = pdf_path.with_name(f"{stem}{pdf_path.suffix.lower()}")
    if target == pdf_path:
        return pdf_path
    # Avoid collisions by suffixing incrementally.
    if target.exists():
        i = 2
        while True:
            candidate = pdf_path.with_name(f"{stem}-{i}{pdf_path.suffix.lower()}")
            if not candidate.exists():
                target = candidate
                break
            i += 1
    pdf_path.rename(target)
    return target


def process_one_pdf(pdf_path: Path, cfg: AgentConfig) -> bool:
    """
    Process a single PDF file end-to-end.
    Returns True on success; False if quarantined.
    """
    _safe_mkdir(cfg.output_json_dir)
    _safe_mkdir(cfg.processed_pdf_dir)
    _safe_mkdir(cfg.errors_dir)

    try:
        original_path = pdf_path
        if not cfg.dry_run:
            pdf_path = _rename_to_kebab(pdf_path)
        recipe_id = to_kebab_case(pdf_path.stem)

        file_hash = _sha256_file(pdf_path)
        out_json = cfg.output_json_dir / f"{recipe_id}.json"

        if out_json.exists() and not cfg.overwrite:
            logger.info("Skipping (JSON exists): %s", out_json)
            if not cfg.dry_run:
                shutil.move(str(pdf_path), str(cfg.processed_pdf_dir / pdf_path.name))
            return True

        text = extract_text_from_pdf(pdf_path)
        recipe_doc = parse_recipe_from_text(
            text=text,
            recipe_id=recipe_id,
            source_file=str(original_path),
        )

        ok, errors = validate_json_data(recipe_doc, cfg.schema_path)
        if not ok:
            logger.error("Schema validation failed for %s", pdf_path.name)
            for e in errors[:50]:
                logger.error("  %s", e)
            if not cfg.dry_run:
                err_dest = cfg.errors_dir / pdf_path.name
                shutil.move(str(pdf_path), str(err_dest))
                # write invalid JSON for inspection
                with (cfg.errors_dir / f"{recipe_id}.invalid.json").open("w", encoding="utf-8") as f:
                    json.dump(recipe_doc, f, ensure_ascii=False, indent=2)
            return False

        if not cfg.dry_run:
            with out_json.open("w", encoding="utf-8") as f:
                json.dump(recipe_doc, f, ensure_ascii=False, indent=2)

        meta = recipe_doc.get("recipe", {})
        logger.info("Parsed recipe: %s (%s)", meta.get("title"), meta.get("id"))

        # Embedding + DB upsert (minimal metadata + embedding).
        if not cfg.no_db:
            ingredients = recipe_doc.get("ingredients") or []
            ingredients_text = " ".join(
                str(i.get("name", "")).strip().lower()
                for i in ingredients
                if isinstance(i, dict) and i.get("name")
            ).strip()

            # Curated embedding input: title + ingredients + steps (shortened).
            steps = recipe_doc.get("steps") or []
            step_text = " ".join(
                str(s.get("instructions", "")).strip()
                for s in steps
                if isinstance(s, dict) and s.get("instructions")
            )
            full_content_for_embedding = "\n".join(
                p for p in [meta.get("title") or "", ingredients_text, step_text] if p
            )

            embedding = embed_text(full_content_for_embedding, model_name=cfg.embedding_model)

            row = {
                "id": meta.get("id"),
                "title": meta.get("title") or "",
                "category": None,
                "mood": None,
                "complexity": meta.get("difficulty") or None,
                "cost": None,
                "ingredients_text": ingredients_text or None,
                "full_content_for_embedding": full_content_for_embedding,
                "embedding": embedding,
                "file_path": str(original_path),
                "file_hash": file_hash,
                "last_indexed": None,
            }

            if cfg.dry_run:
                logger.info("Dry-run: would upsert recipe_index row for %s", meta.get("id"))
            else:
                upsert_recipe_index_row(
                    cfg=SupabaseConfig(
                        url_env=cfg.supabase_url_env,
                        key_env=cfg.supabase_key_env,
                        table=cfg.supabase_table,
                    ),
                    row=row,
                )

        if not cfg.dry_run:
            shutil.move(str(pdf_path), str(cfg.processed_pdf_dir / pdf_path.name))
        return True

    except Exception as exc:
        logger.exception("Failed to process %s: %s", pdf_path, exc)
        if not cfg.dry_run and pdf_path.exists():
            try:
                shutil.move(str(pdf_path), str(cfg.errors_dir / pdf_path.name))
            except Exception:
                pass
        return False


def run_batch(cfg: AgentConfig) -> bool:
    """Process all PDFs in cfg.input_dir."""
    pdfs = sorted(p for p in cfg.input_dir.iterdir() if p.is_file() and p.suffix.lower() == ".pdf")
    if not pdfs:
        logger.info("No PDFs found in %s", cfg.input_dir)
        return True

    ok_all = True
    for p in pdfs:
        ok = process_one_pdf(p, cfg)
        ok_all = ok_all and ok
    return ok_all


def run_watch(cfg: AgentConfig) -> bool:
    """Watch cfg.input_dir and process new/updated PDFs."""
    from watchdog.events import FileSystemEventHandler
    from watchdog.observers import Observer

    def _wait_until_stable(path: Path, *, timeout_s: float = 3.0) -> bool:
        """Wait until the file size is stable across two polls."""
        start = time.monotonic()
        last_size = None
        stable_count = 0
        while time.monotonic() - start < timeout_s:
            try:
                size = path.stat().st_size
            except FileNotFoundError:
                return False
            if last_size is not None and size == last_size:
                stable_count += 1
                if stable_count >= 2:
                    return True
            else:
                stable_count = 0
            last_size = size
            time.sleep(0.2)
        return True  # best-effort

    class Handler(FileSystemEventHandler):
        def __init__(self):
            # Avoid double-processing (created+modified, editor temp writes, etc.)
            self._last_hash: dict[str, str] = {}
            self._last_ts: dict[str, float] = {}

        def _should_process(self, path: Path) -> bool:
            now = time.monotonic()
            # simple time-based debounce
            last = self._last_ts.get(str(path))
            if last is not None and (now - last) < 0.75:
                return False

            # hash-based dedupe (best effort; only if file exists)
            if path.exists():
                try:
                    h = _sha256_file(path)
                except Exception:
                    h = ""
                if h and self._last_hash.get(str(path)) == h:
                    self._last_ts[str(path)] = now
                    return False
                if h:
                    self._last_hash[str(path)] = h

            self._last_ts[str(path)] = now
            return True

        def on_created(self, event):
            if event.is_directory:
                return
            path = Path(event.src_path)
            if path.suffix.lower() != ".pdf":
                return
            _wait_until_stable(path)
            if self._should_process(path):
                process_one_pdf(path, cfg)

        def on_modified(self, event):
            if event.is_directory:
                return
            path = Path(event.src_path)
            if path.suffix.lower() != ".pdf":
                return
            _wait_until_stable(path)
            if self._should_process(path):
                process_one_pdf(path, cfg)

    logger.info("Watching %s ...", cfg.input_dir)
    obs = Observer()
    obs.schedule(Handler(), str(cfg.input_dir), recursive=False)
    obs.start()
    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        logger.info("Stopping watcher.")
    finally:
        obs.stop()
        obs.join()
    return True


