"""Re-export shared jamie-guardrails config."""

from jamie_guardrails.config import GuardrailsSettings, get_guardrails_settings

__all__ = ["GuardrailsSettings", "get_guardrails_settings"]
