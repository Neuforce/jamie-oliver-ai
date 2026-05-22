"""Re-export shared jamie-guardrails NeuGate client."""

import httpx  # noqa: F401 — @patch target for tests

from jamie_guardrails.neugate_client import evaluate_via_neugate

__all__ = ["evaluate_via_neugate", "httpx"]
