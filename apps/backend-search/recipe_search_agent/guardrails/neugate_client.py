"""HTTP client for NeuGate POST /v1/evaluate."""

from __future__ import annotations

from typing import Any

import httpx

from recipe_search_agent.guardrails.config import GuardrailsSettings


def evaluate_via_neugate(
    *,
    message: str,
    policy: dict[str, Any],
    settings: GuardrailsSettings,
) -> dict[str, Any]:
    url = f"{settings.neugate_url}/v1/evaluate"
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.neugate_api_key:
        headers["X-API-Key"] = settings.neugate_api_key

    body = {
        "project_id": settings.neugate_project_id,
        "message": message,
        "policy": policy,
    }

    with httpx.Client(timeout=settings.neugate_timeout_seconds) as client:
        response = client.post(url, json=body, headers=headers)
        response.raise_for_status()
        return response.json()
