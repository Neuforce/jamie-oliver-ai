"""PrePrompt v1.2 content checks for in-kitchen voice (no LLM)."""

import importlib.util
from pathlib import Path

_prompts_path = Path(__file__).resolve().parents[1] / "src" / "config" / "prompts.py"
_spec = importlib.util.spec_from_file_location("voice_prompts", _prompts_path)
assert _spec and _spec.loader
_voice_prompts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_voice_prompts)

PREPROMPT_VERSION = _voice_prompts.PREPROMPT_VERSION
GUARDRAILS_POLICY_BLOCK = _voice_prompts.GUARDRAILS_POLICY_BLOCK
JAMIE_OLIVER_SYSTEM_PROMPT = _voice_prompts.JAMIE_OLIVER_SYSTEM_PROMPT


def test_preprompt_version_constant() -> None:
    assert PREPROMPT_VERSION == "preprompt-v1.2"


def test_voice_system_prompt_includes_guardrails_block() -> None:
    assert GUARDRAILS_POLICY_BLOCK in JAMIE_OLIVER_SYSTEM_PROMPT
    assert "Do not debate" in JAMIE_OLIVER_SYSTEM_PROMPT
    assert "Do not switch recipes" in JAMIE_OLIVER_SYSTEM_PROMPT
