"""JOAv0 JSON Schema validation helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def validate_json_data(data: Any, schema_path: Path) -> tuple[bool, list[str]]:
    schema = _load_json(schema_path)
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    if not errors:
        return True, []
    msgs: list[str] = []
    for e in errors:
        path = ".".join(str(p) for p in e.path) if e.path else "<root>"
        msgs.append(f"{path}: {e.message}")
    return False, msgs


def validate_json_file(json_path: Path, schema_path: Path) -> tuple[bool, list[str]]:
    data = _load_json(json_path)
    return validate_json_data(data, schema_path)


