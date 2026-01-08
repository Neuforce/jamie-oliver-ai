"""Configuration for the recipe PDF agent."""

from __future__ import annotations

import os
from dataclasses import dataclass, replace
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class AgentConfig:
    # Runtime
    log_level: str = "INFO"
    dry_run: bool = False
    no_db: bool = False
    overwrite: bool = False

    # Paths (relative to monorepo root)
    input_dir: Path = Path("data/recipes_pdf_input")
    output_json_dir: Path = Path("data/recipes")
    processed_pdf_dir: Path = Path("data/processed_pdf")
    errors_dir: Path = Path("data/error")

    # Schema
    schema_path: Path = Path("recipe_pdf_agent/joav0_schema.json")

    # Embeddings
    # Use an ONNX-accelerated model that works on Python 3.13 (no torch dependency).
    # 384-dim vectors for pgvector storage.
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # Supabase
    supabase_url_env: str = "SUPABASE_URL"
    supabase_key_env: str = "SUPABASE_SERVICE_ROLE_KEY"
    supabase_table: str = "recipe_index"

    def resolved(self) -> "AgentConfig":
        """
        Resolve relative paths against the jamie-oliver-ai project root so the CLI
        works regardless of the current working directory.
        """
        # Point to monorepo root (jamie-oliver-ai/)
        project_root = Path(__file__).resolve().parents[3]
        return replace(
            self,
            input_dir=(project_root / self.input_dir).resolve() if not self.input_dir.is_absolute() else self.input_dir,
            output_json_dir=(project_root / self.output_json_dir).resolve()
            if not self.output_json_dir.is_absolute()
            else self.output_json_dir,
            processed_pdf_dir=(project_root / self.processed_pdf_dir).resolve()
            if not self.processed_pdf_dir.is_absolute()
            else self.processed_pdf_dir,
            errors_dir=(project_root / self.errors_dir).resolve()
            if not self.errors_dir.is_absolute()
            else self.errors_dir,
            schema_path=(project_root / self.schema_path).resolve() if not self.schema_path.is_absolute() else self.schema_path,
        )

    def with_overrides(
        self,
        *,
        input_dir: Path | None = None,
        dry_run: bool | None = None,
        no_db: bool | None = None,
        overwrite: bool | None = None,
    ) -> "AgentConfig":
        return replace(
            self,
            input_dir=self.input_dir if input_dir is None else input_dir,
            dry_run=self.dry_run if dry_run is None else dry_run,
            no_db=self.no_db if no_db is None else no_db,
            overwrite=self.overwrite if overwrite is None else overwrite,
        )


def load_config() -> AgentConfig:
    """Load config from environment (lightweight) with sensible defaults."""
    # Load .env if present (jamie-oliver-ai/.env)
    project_root = Path(__file__).resolve().parents[1]
    load_dotenv(project_root / ".env", override=False)

    log_level = os.getenv("RECIPE_PDF_LOG_LEVEL", "INFO")
    table = os.getenv("RECIPE_PDF_SUPABASE_TABLE", "recipe_index")
    key_env = os.getenv("RECIPE_PDF_SUPABASE_KEY_ENV", "SUPABASE_SERVICE_ROLE_KEY")

    return AgentConfig(
        log_level=log_level,
        supabase_table=table,
        supabase_key_env=key_env,
    ).resolved()


