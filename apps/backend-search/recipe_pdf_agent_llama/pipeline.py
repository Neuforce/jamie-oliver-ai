"""Pipeline: PDF -> raw text -> Llama -> JOAv0 JSON + chunks -> embeddings -> Supabase."""

from __future__ import annotations

import json
import logging
import os
import shutil
import time
from hashlib import sha256
from pathlib import Path

from recipe_pdf_agent_llama.config import LlamaAgentConfig
from recipe_pdf_agent_llama.kebabcase import to_kebab_case
from recipe_pdf_agent_llama.pdf_extract import extract_blocks_with_coords, extract_raw_text

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


def process_one_pdf(pdf_path: Path, cfg: LlamaAgentConfig) -> bool:
    """
    End-to-end processing for a single PDF.
    This calls Llama and will fail if Ollama is not running.
    """
    from recipe_pdf_agent_llama.llama_structurer import build_clean_and_joav0, detect_category_mood
    from recipe_pdf_agent_llama.chunker import build_intelligent_chunks
    from recipe_pdf_agent_llama.embed import embed_text
    from recipe_pdf_agent_llama.supabase_store import SupabaseConfig, upsert_chunks
    from recipe_pdf_agent_llama.validate import validate_json_data
    try:
        from supabase import create_client
    except Exception:
        create_client = None

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

        raw_text = extract_raw_text(pdf_path)
        blocks = extract_blocks_with_coords(pdf_path)
        if not raw_text.strip():
            raise RuntimeError("PDF text extraction returned empty text")

        clean_text, joav0_doc = build_clean_and_joav0(
            cfg=cfg,
            recipe_id=recipe_id,
            raw_text=raw_text,
            source_file=str(original_path),
            blocks=blocks,
        )

        # Infer tags, course, and cuisine using LLM
        from recipe_pdf_agent_llama.llama_structurer import infer_recipe_metadata, add_on_enter_to_steps
        try:
            metadata = infer_recipe_metadata(cfg=cfg, joav0_doc=joav0_doc)
            # Add inferred metadata to recipe object
            if "recipe" not in joav0_doc:
                joav0_doc["recipe"] = {}
            joav0_doc["recipe"]["tags"] = metadata.get("tags", [])
            if metadata.get("course"):
                joav0_doc["recipe"]["course"] = metadata["course"]
            if metadata.get("cuisine"):
                joav0_doc["recipe"]["cuisine"] = metadata["cuisine"]
            logger.info(f"Inferred metadata for {recipe_id}: tags={len(metadata.get('tags', []))}, course={metadata.get('course')}, cuisine={metadata.get('cuisine')}")
        except Exception as e:
            logger.warning(f"Failed to infer recipe metadata for {recipe_id}: {e}")
        
        # Add on_enter messages to all steps
        try:
            if "steps" in joav0_doc and joav0_doc["steps"]:
                joav0_doc["steps"] = add_on_enter_to_steps(cfg=cfg, steps=joav0_doc["steps"])
                logger.info(f"Added on_enter messages to {len(joav0_doc['steps'])} steps")
        except Exception as e:
            logger.warning(f"Failed to add on_enter to steps for {recipe_id}: {e}")

        ok, errors = validate_json_data(joav0_doc, cfg.schema_path)
        if not ok:
            logger.error("Schema validation failed for %s", pdf_path.name)
            for e in errors[:50]:
                logger.error("  %s", e)
            if not cfg.dry_run:
                err_dest = cfg.errors_dir / pdf_path.name
                shutil.move(str(pdf_path), str(err_dest))
                with (cfg.errors_dir / f"{recipe_id}.invalid.json").open("w", encoding="utf-8") as f:
                    json.dump(joav0_doc, f, ensure_ascii=False, indent=2)
            return False

        if not cfg.dry_run:
            with out_json.open("w", encoding="utf-8") as f:
                json.dump(joav0_doc, f, ensure_ascii=False, indent=2)

        chunks = build_intelligent_chunks(cfg=cfg, recipe_id=recipe_id, clean_text=clean_text, joav0_doc=joav0_doc)
        logger.info("Generated %d chunks for %s", len(chunks), recipe_id)

        if not cfg.no_db:
            # Use the path to the generated JSON file
            json_path = str(out_json) if not cfg.dry_run else str(cfg.output_json_dir / f"{recipe_id}.json")

            # Upsert recipe_index with filters (no embedding)
            if create_client is not None:
                try:
                    client = create_client(
                        os.getenv(cfg.supabase_url_env, ""),
                        os.getenv(cfg.supabase_key_env, ""),
                    )
                    category, mood = detect_category_mood(clean_text)
                    recipe_row = {
                        "id": recipe_id,
                        "title": joav0_doc["recipe"].get("title", recipe_id),
                        "category": category,
                        "mood": mood,
                        "complexity": joav0_doc["recipe"].get("difficulty") or None,
                        "cost": None,
                        "ingredients_text": "\n".join(i.get("name", "") for i in joav0_doc.get("ingredients", [])),
                        "file_path": json_path,
                        "file_hash": file_hash,
                    }
                    client.table("recipe_index").upsert(recipe_row).execute()
                except Exception as e:
                    logger.error("Failed to upsert recipe_index for %s: %s", recipe_id, e)

            rows = []
            for ch in chunks:
                chunk_text = ch["chunk_text"]
                embedding = embed_text(chunk_text, model_name=cfg.embedding_model)
                rows.append(
                    {
                        "recipe_id": recipe_id,
                        "chunk_text": chunk_text,
                        "chunk_hash": ch["chunk_hash"],
                        "search_intent": ch.get("search_intent"),
                        "llm_analysis": ch.get("llm_analysis"),
                        "embedding": embedding,
                        "file_path": json_path,
                        "file_hash": file_hash,
                    }
                )

            if cfg.dry_run:
                logger.info("Dry-run: would upsert %d chunk rows", len(rows))
            else:
                upsert_chunks(
                    cfg=SupabaseConfig(
                        url_env=cfg.supabase_url_env,
                        key_env=cfg.supabase_key_env,
                        table=cfg.chunks_table,
                    ),
                    rows=rows,
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


def run_batch(cfg: LlamaAgentConfig) -> bool:
    pdfs = sorted(p for p in cfg.input_dir.iterdir() if p.is_file() and p.suffix.lower() == ".pdf")
    if not pdfs:
        logger.info("No PDFs found in %s", cfg.input_dir)
        return True
    ok_all = True
    for p in pdfs:
        ok = process_one_pdf(p, cfg)
        ok_all = ok_all and ok
    return ok_all


def run_watch(cfg: LlamaAgentConfig) -> bool:
    from watchdog.events import FileSystemEventHandler
    from watchdog.observers import Observer

    def _wait_until_stable(path: Path, *, timeout_s: float = 3.0) -> bool:
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
        return True

    class Handler(FileSystemEventHandler):
        def __init__(self):
            self._last_ts: dict[str, float] = {}
            self._last_hash: dict[str, str] = {}

        def _debounce(self, path: Path) -> bool:
            now = time.monotonic()
            last = self._last_ts.get(str(path))
            if last is not None and (now - last) < 0.75:
                return False
            # hash dedupe (best effort)
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
            if self._debounce(path):
                process_one_pdf(path, cfg)

        def on_modified(self, event):
            if event.is_directory:
                return
            path = Path(event.src_path)
            if path.suffix.lower() != ".pdf":
                return
            _wait_until_stable(path)
            if self._debounce(path):
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


