"""Process provider webhooks and reconcile entitlements."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from recipe_search_agent.payment_provider import ReconcileEvent, get_payment_provider
from recipe_search_agent.purchase_sync_service import PurchaseSyncService
from recipe_search_agent.repositories import WebhookEventRepository
from recipe_search_agent.spend_mandate_service import SpendMandateService


class WebhookService:
    """Verify, idempotently record, and reconcile provider webhook events."""

    def __init__(
        self,
        *,
        webhook_repository: WebhookEventRepository | None = None,
        purchase_sync_service: PurchaseSyncService | None = None,
        spend_mandate_service: SpendMandateService | None = None,
    ):
        self._webhook_repository = webhook_repository or WebhookEventRepository()
        self._purchase_sync = purchase_sync_service or PurchaseSyncService()
        self._spend_mandate = spend_mandate_service or SpendMandateService()

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
        self._maybe_consume_mandate(reconcile_event)
        self._webhook_repository.mark_processed(provider, event_id)

        return {
            "status": "processed",
            "event_id": event_id,
            "event_type": event_type,
            "reconcile": result,
        }

    def _maybe_consume_mandate(self, event: ReconcileEvent) -> None:
        if not event.user_id or not event.price_amount:
            return
        mandate = self._spend_mandate.get_current_mandate(event.user_id)
        if mandate and mandate.get("status") == "active":
            self._spend_mandate.consume_mandate(mandate, event.price_amount)
