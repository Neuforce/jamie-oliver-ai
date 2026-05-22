"""Fail-safe NeuGate query gate (progressive: bypass or error → proceed)."""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Literal

import httpx

from jamie_guardrails.config import GuardrailsSettings, get_guardrails_settings
from jamie_guardrails.inline_fallback import evaluate_inline_fallback
from jamie_guardrails.neugate_client import evaluate_via_neugate
from jamie_guardrails.policy import load_jamie_policy, neugate_policy, preprompt_version_label

logger = logging.getLogger(__name__)

GateSource = Literal["bypass", "neugate", "fail_safe", "inline_fallback"]


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
    def short_circuit(
        cls, *, response_text: str, category: str, source: GateSource = "neugate"
    ) -> "GateResult":
        return cls(blocked=True, response_text=response_text, category=category, source=source)


def _log_gate(
    level: int,
    msg: str,
    *,
    correlation_id: str,
    gate_source: str,
    preprompt_version: str,
    gate_category: str | None = None,
    blocked: bool | None = None,
) -> None:
    logger.log(
        level,
        msg,
        extra={
            "correlation_id": correlation_id,
            "gate_source": gate_source,
            "preprompt_version": preprompt_version,
            "gate_category": gate_category,
            "guardrail_blocked": blocked,
        },
    )


def evaluate_message_sync(
    message: str,
    *,
    settings: GuardrailsSettings | None = None,
    correlation_id: str | None = None,
) -> GateResult:
    settings = settings or get_guardrails_settings()
    cid = correlation_id or str(uuid.uuid4())
    pv = preprompt_version_label()

    if not settings.neugate_enabled:
        return GateResult.proceed(source="bypass")

    policy = neugate_policy(load_jamie_policy())
    try:
        payload = evaluate_via_neugate(message=message, policy=policy, settings=settings)
    except (httpx.HTTPError, httpx.TimeoutException, OSError, ValueError) as exc:
        _log_gate(
            logging.WARNING,
            "NeuGate unavailable; evaluating inline fallback or fail-safe proceed",
            correlation_id=cid,
            gate_source="fail_safe",
            preprompt_version=pv,
            gate_category=None,
            blocked=False,
        )
        logger.debug("NeuGate error detail %s cid=%s", type(exc).__name__, cid)
        if settings.inline_fallback_on_neugate_error:
            blocked_fb, pivot, cat_fb = evaluate_inline_fallback(message=message, policy=policy)
            if blocked_fb and pivot.strip():
                _log_gate(
                    logging.INFO,
                    "Inline fallback short_circuit after NeuGate error",
                    correlation_id=cid,
                    gate_source="inline_fallback",
                    preprompt_version=pv,
                    gate_category=cat_fb,
                    blocked=True,
                )
                return GateResult.short_circuit(
                    response_text=pivot.strip(),
                    category=cat_fb,
                    source="inline_fallback",
                )
        return GateResult.proceed(source="fail_safe")

    is_violation = bool(payload.get("is_violation"))
    action = str(payload.get("action", ""))
    category = payload.get("category")

    if is_violation or action == "short_circuit":
        cached = payload.get("cached_response")
        if not cached or not str(cached).strip():
            cached = (
                "Let's keep it in the kitchen — "
                "what are you fancying cooking today?"
            )
        _log_gate(
            logging.INFO,
            "NeuGate short_circuit",
            correlation_id=cid,
            gate_source="neugate",
            preprompt_version=pv,
            gate_category=str(category) if category else None,
            blocked=True,
        )
        return GateResult.short_circuit(
            response_text=str(cached).strip(),
            category=str(category) if category else "unknown",
            source="neugate",
        )

    return GateResult.proceed(source="neugate")


async def evaluate_message(
    message: str,
    *,
    settings: GuardrailsSettings | None = None,
    correlation_id: str | None = None,
) -> GateResult:
    return await asyncio.to_thread(
        evaluate_message_sync, message, settings=settings, correlation_id=correlation_id
    )
