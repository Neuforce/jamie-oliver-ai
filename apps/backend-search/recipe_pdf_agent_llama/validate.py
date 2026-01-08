"""Reuse JOAv0 JSON Schema validation helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from recipe_pdf_agent.validate import validate_json_data, validate_json_file  # re-export

__all__ = ["validate_json_data", "validate_json_file", "Path", "Any"]


