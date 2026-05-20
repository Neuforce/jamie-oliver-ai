"""Integration certification against live NeuGate (optional CI job).

Jamie product guarantee: every red-team prompt must be blocked (is_violation=True).
Category label must be a configured policy block slug (not safe_domain).
Exact expected_category match is enforced by NeuGate's own test-runner unit tests;
this suite certifies the integrated path for Jamie's matrix.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
import pytest

from recipe_search_agent.guardrails.config import GuardrailsSettings
from recipe_search_agent.guardrails.policy_loader import load_jamie_policy

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "red_team_matrix.json"

pytestmark = pytest.mark.guardrails


def _neugate_ready(settings: GuardrailsSettings) -> bool:
    try:
        with httpx.Client(timeout=2.0) as client:
            response = client.get(f"{settings.neugate_url}/health/ready")
            return response.status_code == 200
    except (httpx.HTTPError, OSError):
        return False


@pytest.fixture
def guardrails_settings() -> GuardrailsSettings:
    return GuardrailsSettings(
        neugate_enabled=True,
        neugate_url=os.getenv("NEUGATE_URL", "http://localhost:8080").rstrip("/"),
        neugate_api_key=os.getenv("NEUGATE_API_KEY", "").strip(),
        neugate_project_id=os.getenv("NEUGATE_PROJECT_ID", "jamie-oliver-ai"),
        neugate_timeout_seconds=float(os.getenv("NEUGATE_TIMEOUT_SECONDS", "0.8")),
    )


@pytest.mark.guardrails
def test_red_team_matrix_blocks_all_attacks(guardrails_settings: GuardrailsSettings) -> None:
    if not _neugate_ready(guardrails_settings):
        pytest.skip("NeuGate /health/ready not reachable")

    dataset = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    policy = load_jamie_policy()
    allowed_block_labels = set(policy["critical_blocks"]) | set(policy["soft_blocks"])

    headers = {"Content-Type": "application/json"}
    if guardrails_settings.neugate_api_key:
        headers["X-API-Key"] = guardrails_settings.neugate_api_key

    body = {
        "project_id": guardrails_settings.neugate_project_id,
        "policy": policy,
        "test_dataset": dataset,
    }

    with httpx.Client(timeout=120.0) as client:
        response = client.post(
            f"{guardrails_settings.neugate_url}/v1/test-runner",
            json=body,
            headers=headers,
        )
        response.raise_for_status()
        report = response.json()

    not_blocked = [
        r
        for r in report.get("results", [])
        if not r.get("is_violation")
    ]
    if not_blocked:
        lines = [f"  {r['prompt'][:70]} -> {r.get('llm_category')}" for r in not_blocked[:10]]
        pytest.fail(
            f"{len(not_blocked)}/{report['total_tests']} red-team prompts were not blocked:\n"
            + "\n".join(lines)
        )

    wrong_label = [
        r
        for r in report.get("results", [])
        if r.get("is_violation") and r.get("llm_category") not in allowed_block_labels
    ]
    if wrong_label:
        lines = [
            f"  {r['prompt'][:50]} -> {r.get('llm_category')}"
            for r in wrong_label[:5]
        ]
        pytest.fail(
            "Blocked prompts returned a category outside jamie-policy.json:\n" + "\n".join(lines)
        )
