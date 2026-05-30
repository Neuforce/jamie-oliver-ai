"""PrePrompt v1.2 content checks (no LLM)."""

from recipe_search_agent.prompts import (
    DISCOVERY_PROMPT_REVISION,
    GUARDRAILS_POLICY_BLOCK,
    JAMIE_DISCOVERY_PROMPT,
    JAMIE_DISCOVERY_PROMPT_CONCISE,
    PREPROMPT_VERSION,
)


def test_preprompt_version_constant() -> None:
    assert PREPROMPT_VERSION == "preprompt-v1.2"


def test_discovery_prompt_includes_guardrails_block() -> None:
    assert GUARDRAILS_POLICY_BLOCK in JAMIE_DISCOVERY_PROMPT
    assert GUARDRAILS_POLICY_BLOCK in JAMIE_DISCOVERY_PROMPT_CONCISE
    assert "Do not debate" in JAMIE_DISCOVERY_PROMPT
    assert "search_recipes" in JAMIE_DISCOVERY_PROMPT
    assert DISCOVERY_PROMPT_REVISION >= 11
    assert GUARDRAILS_POLICY_BLOCK.strip()
    assert "Right — I'm here for the food, mate" in GUARDRAILS_POLICY_BLOCK
