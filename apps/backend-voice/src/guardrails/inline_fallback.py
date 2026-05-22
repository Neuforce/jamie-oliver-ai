"""Re-export shared jamie-guardrails inline fallback."""

from jamie_guardrails.inline_fallback import (
    evaluate_inline_fallback,
    pivot_from_policy,
    should_block_via_fallback,
)

__all__ = ["evaluate_inline_fallback", "pivot_from_policy", "should_block_via_fallback"]
