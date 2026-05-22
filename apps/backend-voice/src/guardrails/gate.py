"""Re-export shared jamie-guardrails gate (keeps @patch paths stable)."""

from jamie_guardrails.gate import (  # noqa: F401
    GateResult,
    GateSource,
    evaluate_message,
    evaluate_message_sync,
)
from jamie_guardrails.neugate_client import evaluate_via_neugate  # noqa: F401

__all__ = [
    "GateResult",
    "GateSource",
    "evaluate_message",
    "evaluate_message_sync",
    "evaluate_via_neugate",
]
