"""Fail-safe NeuGate query gate (progressive: bypass or error → proceed)."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Literal

import httpx

from recipe_search_agent.guardrails.config import GuardrailsSettings, get_guardrails_settings
from recipe_search_agent.guardrails.neugate_client import evaluate_via_neugate
from recipe_search_agent.guardrails.policy_loader import load_jamie_policy

logger = logging.getLogger(__name__)

GateSource = Literal["bypass", "neugate", "fail_safe"]


@dataclass(frozen=True)
class GateResult:
    blocked: bool
    response_text: str | None
    category: str | None
    source: GateSource

    @classmethod
    def proceed(cls, *, source: GateSource = "bypass") -> "GateResult":
        return cls(blocked=False, response_text=None, category=None, source=source)

    @classmethod
    def short_circuit(cls, *, response_text: str, category: str, source: GateSource = "neugate") -> "GateResult":
        return cls(blocked=True, response_text=response_text, category=category, source=source)


def evaluate_message_sync(
    message: str,
    *,
    settings: GuardrailsSettings | None = None,
) -> GateResult:
    settings = settings or get_guardrails_settings()

    if not settings.neugate_enabled:
        return GateResult.proceed(source="bypass")

    try:
        policy = load_jamie_policy()
        payload = evaluate_via_neugate(message=message, policy=policy, settings=settings)
    except (httpx.HTTPError, httpx.TimeoutException, OSError, ValueError) as exc:
        logger.warning(
            "NeuGate unavailable; fail-safe proceed",
            extra={"gate_source": "fail_safe", "error_type": type(exc).__name__},
        )
        return GateResult.proceed(source="fail_safe")

    is_violation = bool(payload.get("is_violation"))
    action = str(payload.get("action", ""))
    category = payload.get("category")

    if is_violation or action == "short_circuit":
        cached = payload.get("cached_response")
        if not cached or not str(cached).strip():
            cached = "Let's keep it in the kitchen — what are you fancying cooking today?"
        logger.info(
            "NeuGate short_circuit",
            extra={
                "gate_source": "neugate",
                "gate_category": category,
            },
        )
        return GateResult.short_circuit(
            response_text=str(cached).strip(),
            category=str(category) if category else "unknown",
            source="neugate",
        )

    return GateResult.proceed(source="neugate")


async def evaluate_message(message: str, *, settings: GuardrailsSettings | None = None) -> GateResult:
    return await asyncio.to_thread(evaluate_message_sync, message, settings=settings)
