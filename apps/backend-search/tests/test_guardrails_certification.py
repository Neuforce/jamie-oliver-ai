"""Integration certification against live NeuGate (optional CI job)."""

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
def test_red_team_matrix_via_neugate_test_runner(guardrails_settings: GuardrailsSettings) -> None:
    if not _neugate_ready(guardrails_settings):
        pytest.skip("NeuGate /health/ready not reachable")

    dataset = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    policy = load_jamie_policy()
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

    assert report["failed"] == 0, report.get("results", [])[:3]
    assert report["accuracy_rate"] == 1.0
