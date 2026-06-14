"""Repository-level money safety tests."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from recipe_search_agent.repositories import MonetizationRepository, SpendMandateRepository


class FakeUniqueViolationError(Exception):
    code = "23505"


def test_create_purchase_returns_existing_row_on_unique_violation():
    client = MagicMock()
    table = MagicMock()
    insert_query = MagicMock()
    insert_query.execute.side_effect = FakeUniqueViolationError("duplicate key value violates unique constraint")
    table.insert.return_value = insert_query
    client.table.return_value = table

    repository = MonetizationRepository(client=client)
    repository.get_purchase_by_provider_id = MagicMock(
        return_value={"id": "purchase-existing", "provider_purchase_id": "purchase-1"}
    )

    payload = {
        "id": "purchase-new",
        "provider": "supertab",
        "provider_purchase_id": "purchase-1",
    }
    result = repository.create_purchase(payload)

    assert result["id"] == "purchase-existing"
    repository.get_purchase_by_provider_id.assert_called_once_with("supertab", "purchase-1")


def _build_claim_client(returned_rows):
    client = MagicMock()
    query = MagicMock()
    query.update.return_value = query
    query.eq.return_value = query
    query.is_.return_value = query
    query.execute.return_value = SimpleNamespace(data=returned_rows)
    client.table.return_value = query
    return client, query


def test_claim_purchase_for_mandate_consumption_wins_on_single_row():
    client, query = _build_claim_client([{"id": "purchase-1"}])
    repository = MonetizationRepository(client=client)

    assert repository.claim_purchase_for_mandate_consumption("purchase-1") is True
    query.eq.assert_any_call("id", "purchase-1")
    query.eq.assert_any_call("status", "completed")
    query.is_.assert_called_once_with("mandate_consumed_at", "null")


def test_claim_purchase_for_mandate_consumption_loses_when_no_row_updated():
    client, _ = _build_claim_client([])
    repository = MonetizationRepository(client=client)

    assert repository.claim_purchase_for_mandate_consumption("purchase-1") is False


def test_get_active_mandate_filters_expired_records():
    client = MagicMock()
    query = MagicMock()
    query.select.return_value = query
    query.eq.return_value = query
    query.or_.return_value = query
    query.order.return_value = query
    query.limit.return_value = query
    query.execute.return_value = SimpleNamespace(data=[{"id": "mandate-1", "status": "active"}])
    client.table.return_value = query

    repository = SpendMandateRepository(client=client)
    mandate = repository.get_active_mandate("user-1")

    assert mandate and mandate["id"] == "mandate-1"
    assert query.or_.called
    filter_clause = query.or_.call_args[0][0]
    assert filter_clause.startswith("expires_at.is.null,expires_at.gt.")
