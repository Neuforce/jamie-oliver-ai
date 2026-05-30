"""Tests for unified Jamie policy render and NeuGate strip."""

from __future__ import annotations

from pathlib import Path

import pytest

from recipe_search_agent.guardrails.policy_loader import (
    default_policy_path,
    load_jamie_policy,
    neugate_policy,
    render_preprompt_block,
)

_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "guardrails"


def test_default_policy_path_points_to_package_data() -> None:
    path = default_policy_path()
    assert path.name == "jamie-policy.json"
    assert path.is_file()
    assert "jamie_guardrails" in path.parts
    assert "data" in path.parts


def test_load_jamie_policy_includes_preprompt_section() -> None:
    policy = load_jamie_policy()
    assert "preprompt" in policy
    assert "discovery" in policy["preprompt"]["channels"]
    assert "voice" in policy["preprompt"]["channels"]


def test_neugate_policy_strips_preprompt_section() -> None:
    full = load_jamie_policy()
    stripped = neugate_policy(full)
    assert set(stripped.keys()) == {"critical_blocks", "soft_blocks", "pivot_templates"}
    assert "preprompt" not in stripped
    assert "illegal_activities" in stripped["critical_blocks"]


def test_example_pivots_from_policy_appear_in_preprompt() -> None:
    policy = load_jamie_policy()
    discovery = render_preprompt_block("discovery", policy)
    voice = render_preprompt_block("voice", policy)
    for pivot in policy["preprompt"]["channels"]["discovery"]["example_pivots"]:
        assert pivot in discovery
    for pivot in policy["preprompt"]["channels"]["voice"]["example_pivots"]:
        assert pivot in voice


def test_render_preprompt_block_discovery_snapshot() -> None:
    expected = (_FIXTURES / "preprompt_discovery.txt").read_text(encoding="utf-8")
    assert render_preprompt_block("discovery") == expected


def test_render_preprompt_block_voice_snapshot() -> None:
    expected = (_FIXTURES / "preprompt_voice.txt").read_text(encoding="utf-8")
    assert render_preprompt_block("voice") == expected


def test_render_unknown_channel_raises() -> None:
    policy = load_jamie_policy()
    with pytest.raises(ValueError, match="Unknown or missing preprompt channel"):
        render_preprompt_block("invalid", policy)  # type: ignore[arg-type]
