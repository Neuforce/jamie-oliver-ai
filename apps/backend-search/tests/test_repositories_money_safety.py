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
