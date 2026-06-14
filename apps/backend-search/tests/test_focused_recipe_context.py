from recipe_search_agent.focused_recipe_context import build_focused_recipe_context_suffix


def test_focused_context_includes_locked_paywall_guidance():
    suffix = build_focused_recipe_context_suffix("chopped-rainbow-salad", access_state="locked")
    assert "chopped-rainbow-salad" in suffix
    assert "locked" in suffix.lower()
    assert "request_supertab_unlock" in suffix
    assert "ingredients" in suffix.lower()
