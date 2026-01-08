"""Configuration for the Llama-based PDF recipe agent."""

from __future__ import annotations

import os
from dataclasses import dataclass, replace
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class LlamaAgentConfig:
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

    # Schema (reuse existing JOAv0 schema file)
    schema_path: Path = Path("recipe_pdf_agent/joav0_schema.json")

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"

    # Embeddings (384 dims)
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # Supabase
    supabase_url_env: str = "SUPABASE_URL"
    supabase_key_env: str = "SUPABASE_SERVICE_ROLE_KEY"
    chunks_table: str = "intelligent_recipe_chunks"

    # LangChain structured parser (Ollama)
    use_langchain_parser: bool = False
    langchain_ollama_model: str = "llama3.1"
    langchain_num_ctx: int = 4096
    langchain_temperature: float = 0.0
    
    # Semantic density optimization (chunking)
    enable_density_optimization: bool = False
    density_threshold: float = 0.85  # Merge chunks with >85% similarity
    
    # LLM light enrichment (chunking)
    enable_llm_enrichment: bool = False
    enrichment_model: str = "llama3.1"  # Fast model for classification
    enrichment_timeout: int = 10  # Seconds per chunk

    def resolved(self) -> "LlamaAgentConfig":
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
            errors_dir=(project_root / self.errors_dir).resolve() if not self.errors_dir.is_absolute() else self.errors_dir,
            schema_path=(project_root / self.schema_path).resolve() if not self.schema_path.is_absolute() else self.schema_path,
        )

    def with_overrides(
        self,
        *,
        input_dir: Path | None = None,
        dry_run: bool | None = None,
        no_db: bool | None = None,
        overwrite: bool | None = None,
    ) -> "LlamaAgentConfig":
        return replace(
            self,
            input_dir=self.input_dir if input_dir is None else input_dir,
            dry_run=self.dry_run if dry_run is None else dry_run,
            no_db=self.no_db if no_db is None else no_db,
            overwrite=self.overwrite if overwrite is None else overwrite,
        )


def load_config() -> LlamaAgentConfig:
    project_root = Path(__file__).resolve().parents[1]
    load_dotenv(project_root / ".env", override=False)

    return LlamaAgentConfig(
        log_level=os.getenv("RECIPE_LLAMA_LOG_LEVEL", "INFO"),
        ollama_base_url=os.getenv("RECIPE_LLAMA_OLLAMA_URL", "http://localhost:11434"),
        ollama_model=os.getenv("RECIPE_LLAMA_MODEL", "llama3.1"),
        chunks_table=os.getenv("RECIPE_LLAMA_SUPABASE_TABLE", "intelligent_recipe_chunks"),
        use_langchain_parser=os.getenv("RECIPE_LLAMA_USE_LANGCHAIN", "false").lower() == "true",
        langchain_ollama_model=os.getenv("RECIPE_LLAMA_LANGCHAIN_MODEL", "llama3.1"),
        langchain_num_ctx=int(os.getenv("RECIPE_LLAMA_LANGCHAIN_NUM_CTX", "4096")),
        langchain_temperature=float(os.getenv("RECIPE_LLAMA_LANGCHAIN_TEMPERATURE", "0.0")),
        enable_density_optimization=os.getenv("RECIPE_LLAMA_ENABLE_DENSITY", "false").lower() == "true",
        density_threshold=float(os.getenv("RECIPE_LLAMA_DENSITY_THRESHOLD", "0.85")),
        enable_llm_enrichment=os.getenv("RECIPE_LLAMA_ENABLE_LLM_ENRICHMENT", "false").lower() == "true",
        enrichment_model=os.getenv("RECIPE_LLAMA_ENRICHMENT_MODEL", "llama3.1"),
        enrichment_timeout=int(os.getenv("RECIPE_LLAMA_ENRICHMENT_TIMEOUT", "10")),
    ).resolved()


