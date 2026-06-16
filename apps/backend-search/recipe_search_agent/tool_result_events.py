"""Map discovery tool JSON results to structured ChatEvents (toolCallId-bound)."""

from __future__ import annotations

import logging
from typing import Any, Optional

from recipe_search_agent.chat_events import ChatEvent
from recipe_search_agent.recipe_catalog import get_published_catalog
from recipe_search_agent.recipe_pricing import resolve_recipe_price

logger = logging.getLogger(__name__)


def _with_correlation(
    metadata: dict[str, Any],
    *,
    tool_call_id: str,
    response_id: str,
) -> dict[str, Any]:
    enriched = dict(metadata)
    enriched["tool_call_id"] = tool_call_id
    enriched["response_id"] = response_id
    return enriched


def _filter_recipes(recipes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    catalog = get_published_catalog()
    filtered: list[dict[str, Any]] = []
    for recipe in recipes:
        slug = (recipe.get("recipe_id") or "").strip()
        if slug and catalog.is_published(slug):
            filtered.append(recipe)
    return filtered


def tool_result_to_chat_events(
    func_name: str,
    tool_call_id: str,
    result: dict[str, Any],
    *,
    response_id: str,
) -> list[ChatEvent]:
    """Emit UI events bound to a single tool invocation."""
    events: list[ChatEvent] = []

    if func_name in ("search_recipes", "suggest_recipes_for_mood"):
        recipes = _filter_recipes(result.get("recipes") or [])
        if recipes:
            events.append(
                ChatEvent(
                    type="recipes",
                    content="",
                    metadata=_with_correlation(
                        {
                            "recipes": recipes,
                            "mood": result.get("mood"),
                            "mood_explanation": result.get("mood_explanation"),
                        },
                        tool_call_id=tool_call_id,
                        response_id=response_id,
                    ),
                )
            )

    elif func_name == "plan_meal":
        events.append(
            ChatEvent(
                type="meal_plan",
                content="",
                metadata=_with_correlation(
                    {
                        "meal_plan": result,
                        "occasion": result.get("occasion"),
                        "serves": result.get("serves"),
                    },
                    tool_call_id=tool_call_id,
                    response_id=response_id,
                ),
            )
        )

    elif func_name == "get_recipe_details":
        recipe = result.get("recipe")
        if recipe and recipe.get("recipe_id"):
            events.append(
                ChatEvent(
                    type="recipe_detail",
                    content="",
                    metadata=_with_correlation(
                        {"recipe": recipe},
                        tool_call_id=tool_call_id,
                        response_id=response_id,
                    ),
                )
            )

    elif func_name == "create_shopping_list":
        events.append(
            ChatEvent(
                type="shopping_list",
                content="",
                metadata=_with_correlation(
                    {
                        "shopping_list": result,
                        "recipes_included": result.get("recipes_included"),
                        "total_items": result.get("total_items"),
                    },
                    tool_call_id=tool_call_id,
                    response_id=response_id,
                ),
            )
        )

    elif func_name == "request_supertab_unlock":
        if not result.get("ok"):
            return events
        rid = (result.get("recipe_backend_id") or "").strip()
        if not rid:
            return events
        recipe_detail = result.get("recipe_detail")
        if recipe_detail:
            events.append(
                ChatEvent(
                    type="recipe_detail",
                    content="",
                    metadata=_with_correlation(
                        {"recipe": recipe_detail},
                        tool_call_id=tool_call_id,
                        response_id=response_id,
                    ),
                )
            )

        # Backend-authoritative decision computed in the tool. When auto_charge
        # is true the client charges silently against the active mandate, so we
        # MUST NOT create a server-side ask or emit a consent request.
        auto_charge = bool(result.get("auto_charge"))
        serialized_mandate = result.get("mandate") if isinstance(result.get("mandate"), dict) else None

        price_amount, currency_code = resolve_recipe_price(rid)
        ceiling_amount = max(1000, price_amount)

        if not auto_charge:
            ask_id: Optional[str] = None
            try:
                from recipe_search_agent.commerce_context import get_commerce_session_id, get_commerce_user_id
                from recipe_search_agent.spend_mandate_ask_service import SpendMandateAskService

                session_id = get_commerce_session_id()
                if session_id:
                    ask = SpendMandateAskService().create_ask(
                        backend_recipe_id=rid,
                        price_amount=price_amount,
                        currency_code=currency_code,
                        ceiling_amount=ceiling_amount,
                        session_id=session_id,
                        user_id=get_commerce_user_id(),
                        tool_call_id=tool_call_id,
                        response_id=response_id,
                    )
                    ask_id = ask.get("id")
            except Exception:
                logger.exception("Failed to create server-side spend mandate ask for recipe %s", rid)

            consent_metadata: dict[str, Any] = {
                "backend_recipe_id": rid,
                "price_amount": price_amount,
                "currency_code": currency_code,
                "ceiling_amount": ceiling_amount,
            }
            if ask_id:
                consent_metadata["ask_id"] = ask_id
            else:
                consent_metadata["ask_degraded"] = True

            events.append(
                ChatEvent(
                    type="spend_mandate_consent_requested",
                    content="",
                    metadata=_with_correlation(
                        consent_metadata,
                        tool_call_id=tool_call_id,
                        response_id=response_id,
                    ),
                )
            )

        purchase_intent = result.get("purchase_intent")
        paywall_metadata: dict[str, Any] = {
            "backend_recipe_id": rid,
            "auto_charge": auto_charge,
            **({"purchase_intent": purchase_intent} if purchase_intent else {}),
        }
        if auto_charge:
            paywall_metadata["mandate"] = serialized_mandate
        events.append(
            ChatEvent(
                type="recipe_paywall_requested",
                content="",
                metadata=_with_correlation(
                    paywall_metadata,
                    tool_call_id=tool_call_id,
                    response_id=response_id,
                ),
            )
        )

    return events


def build_recipe_detail_payload(recipe_row: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Summary recipe_detail payload from a Supabase recipes row."""
    slug = recipe_row.get("slug")
    if not slug:
        return None
    recipe_json = recipe_row.get("recipe_json") or {}
    recipe = recipe_json.get("recipe") or {}
    ingredients = recipe_json.get("ingredients") or []
    steps = recipe_json.get("steps") or []
    return {
        "recipe_id": slug,
        "title": recipe.get("title", slug),
        "description": recipe.get("description", ""),
        "servings": recipe.get("servings"),
        "estimated_time": recipe.get("estimated_total", ""),
        "difficulty": recipe.get("difficulty", ""),
        "ingredient_count": len(ingredients),
        "step_count": len(steps),
        "ingredients": [],
        "steps": [],
        "notes": "",
        "access_hint": (
            "Summary only in discovery chat. Full ingredient list and step-by-step method "
            "appear on the recipe sheet; locked recipes require Unlock / My Tab before cooking."
        ),
        "next_step_hint": "Open the full recipe view for ingredients, steps, and cook mode (Unlock if locked).",
    }
