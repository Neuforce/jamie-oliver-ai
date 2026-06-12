"""Unit tests for agentic payments foundations."""

from __future__ import annotations

import json

import pytest

from recipe_search_agent.commerce_capability import (
    build_commerce_capability_manifest,
    build_purchase_intent_payload,
)
from recipe_search_agent.payment_provider import ReconcileEvent, SupertabProvider
from recipe_search_agent.purchase_sync_service import PurchaseSyncService
from recipe_search_agent.spend_mandate_service import SpendMandateService
from recipe_search_agent.webhook_service import WebhookService
from test_foundations_services import FakeMonetizationRepository


class FakeWebhookRepository:
    def __init__(self):
        self.events = {}

    def insert_if_absent(self, payload):
        key = (payload["provider"], payload["event_id"])
        if key in self.events:
            return self.events[key], False
        self.events[key] = payload
        return payload, True

    def mark_processed(self, provider, event_id):
        key = (provider, event_id)
        row = self.events.get(key)
        if row:
            row["processed_at"] = "now"
        return row


class FakeSpendMandateRepository:
    def __init__(self):
        self.mandates = {}

    def get_active_mandate(self, user_id):
        for mandate in self.mandates.values():
            if mandate["user_id"] == user_id and mandate["status"] == "active":
                return mandate
        return None

    def create_mandate(self, payload):
        self.mandates[payload["id"]] = payload
        return payload

    def update_mandate(self, mandate_id, updates):
        mandate = self.mandates[mandate_id]
        mandate.update(updates)
        return mandate

    def revoke_active_mandates(self, user_id):
        revoked = []
        for mandate in self.mandates.values():
            if mandate["user_id"] == user_id and mandate["status"] == "active":
                mandate["status"] = "revoked"
                revoked.append(mandate)
        return revoked


def test_supertab_provider_maps_purchase_completed():
    provider = SupertabProvider(webhook_secret="whsec_test")
    body = {
        "type": "purchase.completed",
        "data": {
            "purchase": {
                "id": "purchase.abc",
                "status": "completed",
                "price": {"amount": 199, "currency": {"code": "USD"}},
                "metadata": {
                    "content_key": "recipe:avocado-toast:cook",
                    "recipe_id": "avocado-toast",
                    "jamie_user_id": "user-1",
                },
            }
        },
    }
    event = provider.map_event(body, event_id="evt-1")
    assert event is not None
    assert event.provider_purchase_id == "purchase.abc"
    assert event.content_key == "recipe:avocado-toast:cook"
    assert event.user_id == "user-1"


def test_purchase_sync_reconcile_from_webhook_event():
    repository = FakeMonetizationRepository()
    repository.get_offering_by_content_key = lambda content_key: {
        "id": "offering-1",
        "content_key": content_key,
        "is_free": False,
        "recipe_id": "recipe-uuid-1",
    }
    service = PurchaseSyncService(repository=repository)
    event = ReconcileEvent(
        provider="supertab",
        event_id="evt-1",
        event_type="purchase.completed",
        provider_purchase_id="purchase.webhook-1",
        status="completed",
        content_key="recipe:avocado-toast:cook",
        recipe_slug_or_id="avocado-toast",
        user_id="user-1",
        price_amount=199,
        currency_code="USD",
        purchased_at="2026-06-09T00:00:00Z",
        completed_at="2026-06-09T00:00:01Z",
        provider_payload={"offeringId": "offering.supertab"},
    )
    result = service.reconcile(event)
    assert result["purchase"]["provider_purchase_id"] == "purchase.webhook-1"
    assert result["entitlement"]["provider_content_key"] == "recipe:avocado-toast:cook"


def test_spend_mandate_service_gates_and_consumes():
    repo = FakeSpendMandateRepository()
    service = SpendMandateService(repository=repo)
    mandate = service.create_mandate(user_id="user-1", ceiling_amount=500, currency_code="USD")
    allowed, active, reason = service.can_charge("user-1", 199)
    assert allowed is True
    assert reason == "within_ceiling"
    updated = service.consume_mandate(active, 199)
    assert updated["consumed_amount"] == 199
    allowed2, _, reason2 = service.can_charge("user-1", 400)
    assert allowed2 is False
    assert reason2 == "exceeds_ceiling"


def test_webhook_service_is_idempotent(monkeypatch: pytest.MonkeyPatch):
    repository = FakeMonetizationRepository()
    repository.get_offering_by_content_key = lambda content_key: {
        "id": "offering-1",
        "content_key": content_key,
        "is_free": False,
        "recipe_id": "recipe-uuid-1",
    }
    webhook_repo = FakeWebhookRepository()
    purchase_sync = PurchaseSyncService(repository=repository)
    spend_repo = FakeSpendMandateRepository()
    spend_service = SpendMandateService(repository=spend_repo)
    spend_service.create_mandate(user_id="user-1", ceiling_amount=1000)

    service = WebhookService(
        webhook_repository=webhook_repo,
        purchase_sync_service=purchase_sync,
        spend_mandate_service=spend_service,
    )

    body = {
        "type": "purchase.completed",
        "data": {
            "purchase": {
                "id": "purchase.webhook-2",
                "status": "completed",
                "price": {"amount": 199, "currency": {"code": "USD"}},
                "metadata": {
                    "content_key": "recipe:avocado-toast:cook",
                    "recipe_id": "avocado-toast",
                    "jamie_user_id": "user-1",
                },
            }
        },
    }

    class FakeProvider:
        provider_name = "supertab"

        def verify_webhook(self, *, payload, headers):
            return json.loads(payload.decode())

        def map_event(self, body, *, event_id):
            return SupertabProvider(webhook_secret="x").map_event(body, event_id=event_id)

    monkeypatch.setattr(
        "recipe_search_agent.webhook_service.get_payment_provider",
        lambda provider: FakeProvider(),
    )

    first = service.process_webhook("supertab", payload=json.dumps(body).encode(), headers={"svix-id": "evt-dup"})
    second = service.process_webhook("supertab", payload=json.dumps(body).encode(), headers={"svix-id": "evt-dup"})
    assert first["status"] == "processed"
    assert second["status"] == "duplicate"


def test_commerce_capability_manifest():
    manifest = build_commerce_capability_manifest()
    assert manifest["protocol"] == "jamie-commerce-v1"
    assert manifest["capabilities"][0]["id"] == "recipe_unlock"


def test_build_purchase_intent_payload():
    intent = build_purchase_intent_payload(
        user_id="user-1",
        recipe_slug="avocado-toast",
        content_key="recipe:avocado-toast:cook",
        price_amount=199,
        onetime_offering_id="onetime.abc",
    )
    assert intent["intent_type"] == "recipe_unlock"
    assert intent["offer"]["onetime_offering_id"] == "onetime.abc"
