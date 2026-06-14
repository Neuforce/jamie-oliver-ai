"""Build focused recipe-sheet context injected into discovery chat/voice turns."""

from typing import Optional


def build_focused_recipe_context_suffix(
    focused_id: str,
    *,
    access_state: Optional[str] = None,
) -> str:
    """Append tool-only context when the full recipe sheet is open in the client."""
    rid = (focused_id or "").strip()
    if not rid:
        return ""

    access = (access_state or "").strip().lower()
    if access == "locked":
        access_line = (
            "Access on their device: **locked** — they see summary info (title, description, time, "
            "difficulty) but **full ingredients and cooking steps are behind Unlock / My Tab**. "
            "Do **not** say they can already see all ingredients or steps; steer to **Unlock** or "
            "`request_supertab_unlock` when they want to cook or buy."
        )
    elif access in {"free", "owned"}:
        access_line = (
            f"Access on their device: **{access}** — they can open ingredients, steps, and cook mode "
            "on the recipe sheet."
        )
    else:
        access_line = (
            "The sheet shows summary info; **full ingredients and step-by-step cooking may require "
            "Unlock / My Tab** unless the app already shows them. Do not assume they see the full "
            "method — describe what's on the summary and mention Unlock when they want every step."
        )

    return (
        f"\n\n[Context for tools only: The full recipe sheet is focused on backend recipe "
        f"id `{rid}`. {access_line} "
        "When they clearly ask to **unlock**, **purchase**, **pay**, put something **on My Tab**, "
        "or **open checkout** for this recipe, call `request_supertab_unlock` with "
        f"recipe_backend_id exactly `{rid}`. "
        "When they ask you to **open** the recipe and the sheet is already focused, confirm it "
        "should be on screen — do not call search for a different recipe.]"
    )
