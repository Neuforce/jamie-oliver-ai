"""Process provider webhooks and reconcile entitlements."""

from __future__ import annotations

import uuid
from typing import Any

from recipe_search_agent.payment_provider import get_payment_provider
from recipe_search_agent.purchase_sync_service import PurchaseSyncService
from recipe_search_agent.repositories import WebhookEventRepository


class WebhookService:
    """Verify, idempotently record, and reconcile provider webhook events."""

    def __init__(
        self,
        *,
        webhook_repository: WebhookEventRepository | None = None,
        purchase_sync_service: PurchaseSyncService | None = None,
    ):
        self._webhook_repository = webhook_repository or WebhookEventRepository()
        self._purchase_sync = purchase_sync_service or PurchaseSyncService()

    def process_webhook(
        self,
        provider: str,
        *,
        payload: bytes,
        headers: dict[str, str],
    ) -> dict[str, Any]:
        adapter = get_payment_provider(provider)
        body = adapter.verify_webhook(payload=payload, headers=headers)

        event_id = (
            headers.get("svix-id")
            or headers.get("Svix-Id")
            or body.get("id")
            or str(uuid.uuid4())
        )
        event_type = body.get("type") or "unknown"

        _, created = self._webhook_repository.insert_if_absent(
            {
                "id": str(uuid.uuid4()),
                "provider": provider,
                "event_id": event_id,
                "event_type": event_type,
                "payload": body,
            }
        )
        if not created:
            return {"status": "duplicate", "event_id": event_id}

        reconcile_event = adapter.map_event(body, event_id=event_id)
        if not reconcile_event:
            self._webhook_repository.mark_processed(provider, event_id)
            return {"status": "ignored", "event_id": event_id, "event_type": event_type}

        result = self._purchase_sync.reconcile(reconcile_event)
        self._webhook_repository.mark_processed(provider, event_id)

        return {
            "status": "processed",
            "event_id": event_id,
            "event_type": event_type,
            "reconcile": result,
        }

