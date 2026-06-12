"""UCP/MCP-compatible commerce capability descriptors for agentic purchases."""

from __future__ import annotations

from typing import Any, Optional


def build_commerce_capability_manifest() -> dict[str, Any]:
    """Describe Jamie's agentic commerce capabilities for external agents (UCP-style)."""
    return {
        "protocol": "jamie-commerce-v1",
        "compatible_with": ["ucp-draft", "ap2-session-mandate"],
        "capabilities": [
            {
                "id": "recipe_unlock",
                "description": "Unlock a paid Jamie Oliver recipe for guided cooking",
                "requires_mandate": True,
                "provider": "supertab",
                "execution_surface": "client",
                "endpoints": {
                    "create_offer": "/api/v1/offerings/onetime",
                    "spend_mandate": "/api/v1/spend-mandates",
                    "access_check": "/api/v1/recipes/{recipe_id}/access",
                    "reconcile": "/api/v1/webhooks/{provider}",
                },
            },
        ],
    }


def build_purchase_intent_payload(
    *,
    user_id: str,
    recipe_slug: str,
    content_key: str,
    price_amount: int,
    currency_code: str = "USD",
    mandate_id: Optional[str] = None,
    provider: str = "supertab",
    onetime_offering_id: Optional[str] = None,
    offering_id: Optional[str] = None,
) -> dict[str, Any]:
    """Neutral purchase intent for agent/client execution."""
    return {
        "intent_type": "recipe_unlock",
        "provider": provider,
        "user_id": user_id,
        "recipe_slug": recipe_slug,
        "content_key": content_key,
        "price_amount": price_amount,
        "currency_code": currency_code,
        "mandate_id": mandate_id,
        "offer": {
            "offering_id": offering_id,
            "onetime_offering_id": onetime_offering_id,
        },
        "metadata": {
            "jamie_user_id": user_id,
            "recipe_id": recipe_slug,
            "content_key": content_key,
            "source": "agentic-commerce",
        },
    }
