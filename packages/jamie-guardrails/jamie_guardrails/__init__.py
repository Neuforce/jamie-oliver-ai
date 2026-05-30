"""Shared NeuGate guardrails for Jamie Oliver AI."""

from jamie_guardrails.config import GuardrailsSettings, get_guardrails_settings
from jamie_guardrails.gate import GateResult, evaluate_message, evaluate_message_sync
from jamie_guardrails.policy import (
    clear_policy_cache,
    default_policy_path,
    load_jamie_policy,
    neugate_policy,
    render_preprompt_block,
)
from jamie_guardrails.session import is_gate_blocked, reset_gate_blocked, set_gate_blocked

__all__ = [
    "GuardrailsSettings",
    "GateResult",
    "clear_policy_cache",
    "default_policy_path",
    "evaluate_message",
    "evaluate_message_sync",
    "get_guardrails_settings",
    "is_gate_blocked",
    "load_jamie_policy",
    "neugate_policy",
    "render_preprompt_block",
    "reset_gate_blocked",
    "set_gate_blocked",
]
