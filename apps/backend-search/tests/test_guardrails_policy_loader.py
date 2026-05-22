"""Tests for Jamie policy loading (NeuGate request body)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from recipe_search_agent.guardrails.policy_loader import load_jamie_policy, neugate_policy


def test_load_jamie_policy_default_path() -> None:
    policy = load_jamie_policy()
    assert "critical_blocks" in policy
    assert "soft_blocks" in policy
    assert "pivot_templates" in policy
    assert "preprompt" in policy
    assert "illegal_activities" in policy["critical_blocks"]
    assert len(policy["pivot_templates"]) >= 1


def test_neugate_policy_from_loaded_default() -> None:
    stripped = neugate_policy(load_jamie_policy())
    assert "preprompt" not in stripped
    assert "critical_blocks" in stripped


def test_load_jamie_policy_from_custom_path(tmp_path: Path) -> None:
    custom = {
        "critical_blocks": ["illegal_activities"],
        "soft_blocks": [],
        "pivot_templates": ["Kitchen only."],
    }
    path = tmp_path / "policy.json"
    path.write_text(json.dumps(custom), encoding="utf-8")
    load_jamie_policy.cache_clear()
    try:
        assert load_jamie_policy(path) == custom
    finally:
        load_jamie_policy.cache_clear()


def test_load_jamie_policy_missing_file_raises() -> None:
    load_jamie_policy.cache_clear()
    try:
        with pytest.raises(FileNotFoundError):
            load_jamie_policy(Path("/nonexistent/jamie-policy.json"))
    finally:
        load_jamie_policy.cache_clear()
