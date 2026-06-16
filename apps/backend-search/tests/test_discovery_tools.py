import json
import sys
from types import SimpleNamespace
from types import ModuleType


if "ccai.core.function_manager.function_manager" not in sys.modules:
    ccai_module = ModuleType("ccai")
    ccai_core_module = ModuleType("ccai.core")
    ccai_function_manager_module = ModuleType("ccai.core.function_manager")
    ccai_function_manager_impl = ModuleType("ccai.core.function_manager.function_manager")

    class _StubFunctionManager:
        def __init__(self):
            self.registered_functions = []

        def register_function(self, fn):
            self.registered_functions.append(fn)

    ccai_function_manager_impl.FunctionManager = _StubFunctionManager

    sys.modules["ccai"] = ccai_module
    sys.modules["ccai.core"] = ccai_core_module
    sys.modules["ccai.core.function_manager"] = ccai_function_manager_module
    sys.modules["ccai.core.function_manager.function_manager"] = ccai_function_manager_impl

if "supabase" not in sys.modules:
    supabase_module = ModuleType("supabase")

    class _StubClient:
        pass

    def _stub_create_client(*_args, **_kwargs):
        raise RuntimeError("create_client should not be called in these unit tests")

    supabase_module.Client = _StubClient
    supabase_module.create_client = _stub_create_client
    sys.modules["supabase"] = supabase_module

if "recipe_search_agent.guardrails" not in sys.modules:
    guardrails_module = ModuleType("recipe_search_agent.guardrails")
    guardrails_module.is_gate_blocked = lambda: False
    sys.modules["recipe_search_agent.guardrails"] = guardrails_module

from recipe_search_agent.discovery_tools import (
    MIN_SIMILARITY,
    get_recipe_details,
    request_supertab_unlock,
    search_recipes,
    set_search_agent,
)


class _FakeExecuteResult:
    def __init__(self, data):
        self.data = data


class _FakeRecipesQuery:
    def __init__(self, row):
        self._row = row

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _FakeExecuteResult([self._row])


class _FakeClient:
    def __init__(self, row):
        self._row = row

    def table(self, _name):
        return _FakeRecipesQuery(self._row)


class _FakeSearchAgent:
    def __init__(self, row):
        self.client = _FakeClient(row)


class _FakeRecipeSearchAgent:
    def __init__(self, matches):
        self._matches = matches
        self.search_calls = []

    def search(self, **kwargs):
        self.search_calls.append(kwargs)
        return list(self._matches)


class _AlwaysPublishedCatalog:
    def is_published(self, _slug):
        return True


class _PublishedCatalogWithRow(_AlwaysPublishedCatalog):
    def __init__(self, row):
        self._row = row

    def get_recipe_row(self, _slug):
        return self._row


def test_get_recipe_details_returns_summary_only_payload():
    recipe_row = {
        "slug": "basic-tomato-sauce",
        "status": "published",
        "recipe_json": {
            "recipe": {
                "title": "Basic Tomato Sauce",
                "description": "A rich tomato sauce for pasta and pizza.",
                "servings": 6,
                "estimated_total": "PT70M",
                "difficulty": "not-too-tricky",
            },
            "ingredients": [
                {"name": "Garlic", "quantity": "2", "unit": "cloves"},
                {"name": "Tomatoes", "quantity": "2", "unit": "tins"},
            ],
            "steps": [
                {"instructions": "Peel and slice the garlic."},
                {"instructions": "Simmer the tomatoes until rich and glossy."},
            ],
            "notes": {"text": "Finish with basil."},
        }
    }
    set_search_agent(_FakeSearchAgent(recipe_row))
    from recipe_search_agent import recipe_catalog

    recipe_catalog._catalog = _AlwaysPublishedCatalog()

    payload = json.loads(get_recipe_details("basic-tomato-sauce"))
    recipe = payload["recipe"]

    assert recipe["recipe_id"] == "basic-tomato-sauce"
    assert recipe["title"] == "Basic Tomato Sauce"
    assert recipe["ingredient_count"] == 2
    assert recipe["step_count"] == 2
    assert recipe["ingredients"] == []
    assert recipe["steps"] == []
    assert recipe["next_step_hint"]


def test_search_recipes_returns_empty_for_genuine_no_match(monkeypatch):
    matches = [
        SimpleNamespace(
            recipe_id="not-relevant-1",
            title="Random Roast Chicken",
            similarity_score=0.22,
            full_recipe={"recipe": {"description": "Unrelated", "difficulty": "easy"}},
        ),
        SimpleNamespace(
            recipe_id="not-relevant-2",
            title="Another Unrelated Dish",
            similarity_score=0.39,
            full_recipe={"recipe": {"description": "Still unrelated", "difficulty": "easy"}},
        ),
    ]
    fake_agent = _FakeRecipeSearchAgent(matches)
    set_search_agent(fake_agent)
    monkeypatch.setattr(
        "recipe_search_agent.recipe_catalog.get_published_catalog",
        lambda: _AlwaysPublishedCatalog(),
    )

    payload = json.loads(search_recipes(query="tacos", max_results=5))

    assert payload["found"] == 0
    assert payload["recipes"] == []
    assert "No recipes found" in payload["message"]


def test_search_recipes_enforces_min_similarity_floor(monkeypatch):
    matches = [
        SimpleNamespace(
            recipe_id="strong-match",
            title="Spicy Bean Tacos",
            similarity_score=MIN_SIMILARITY,
            full_recipe={
                "recipe": {
                    "description": "Taco night winner",
                    "servings": 4,
                    "estimated_total": "35m",
                    "difficulty": "easy",
                },
                "ingredients": [{"name": "beans"}],
                "steps": [{"text": "Cook beans"}],
            },
        ),
        SimpleNamespace(
            recipe_id="weak-match",
            title="Pasta Salad",
            similarity_score=MIN_SIMILARITY - 0.01,
            full_recipe={"recipe": {"description": "Weak relevance", "difficulty": "easy"}},
        ),
    ]
    fake_agent = _FakeRecipeSearchAgent(matches)
    set_search_agent(fake_agent)
    monkeypatch.setattr(
        "recipe_search_agent.recipe_catalog.get_published_catalog",
        lambda: _AlwaysPublishedCatalog(),
    )

    payload = json.loads(search_recipes(query="tacos", max_results=5))

    assert payload["found"] == 1
    assert len(payload["recipes"]) == 1
    assert all(recipe["similarity_score"] >= MIN_SIMILARITY for recipe in payload["recipes"])
    assert payload["recipes"][0]["recipe_id"] == "strong-match"


def _unlock_recipe_row(recipe_uuid):
    return {
        "id": recipe_uuid,
        "slug": "basic-tomato-sauce",
        "status": "published",
        "recipe_json": {"recipe": {"title": "Basic Tomato Sauce"}},
    }


def test_request_supertab_unlock_returns_auto_charge_with_mandate(monkeypatch):
    recipe_row = _unlock_recipe_row("recipe-uuid-1")
    set_search_agent(_FakeSearchAgent(recipe_row))

    monkeypatch.setattr(
        "recipe_search_agent.recipe_catalog.get_published_catalog",
        lambda: _PublishedCatalogWithRow(recipe_row),
    )
    monkeypatch.setattr("recipe_search_agent.discovery_tools.get_commerce_user_id", lambda: "user-123")
    monkeypatch.setattr("recipe_search_agent.discovery_tools.resolve_recipe_price", lambda _rid: (199, "USD"))

    mandate = {
        "id": "mandate-1",
        "user_id": "user-123",
        "session_id": "sess-1",
        "ceiling_amount": 1000,
        "currency_code": "USD",
        "consumed_amount": 200,
        "status": "active",
        "source": "voice",
    }

    class _FakeSpendMandateService:
        def can_charge(self, user_id, amount):
            assert user_id == "user-123"
            assert amount == 199
            return True, mandate, "within_ceiling"

    monkeypatch.setattr(
        "recipe_search_agent.discovery_tools.SpendMandateService",
        lambda: _FakeSpendMandateService(),
    )

    payload = json.loads(request_supertab_unlock("basic-tomato-sauce"))

    assert payload["ok"] is True
    assert payload["auto_charge"] is True
    assert payload["remaining_amount"] == 800
    assert payload["mandate"]["id"] == "mandate-1"
    assert payload["mandate"]["remainingAmount"] == 800
    assert "Tab" in payload["guidance"]


def test_request_supertab_unlock_auto_charge_false_without_user_id(monkeypatch):
    recipe_row = _unlock_recipe_row("recipe-uuid-2")
    set_search_agent(_FakeSearchAgent(recipe_row))

    monkeypatch.setattr(
        "recipe_search_agent.recipe_catalog.get_published_catalog",
        lambda: _PublishedCatalogWithRow(recipe_row),
    )
    monkeypatch.setattr("recipe_search_agent.discovery_tools.get_commerce_user_id", lambda: None)

    payload = json.loads(request_supertab_unlock("basic-tomato-sauce"))

    assert payload["ok"] is True
    assert payload["auto_charge"] is False
    assert payload["mandate"] is None
    assert payload["remaining_amount"] == 0
    assert payload["guidance"] == "Ask: Mind if I put this on your Tab? Yes / Not now."


def test_request_supertab_unlock_auto_charge_false_when_headroom_insufficient(monkeypatch):
    recipe_row = _unlock_recipe_row("recipe-uuid-3")
    set_search_agent(_FakeSearchAgent(recipe_row))

    monkeypatch.setattr(
        "recipe_search_agent.recipe_catalog.get_published_catalog",
        lambda: _PublishedCatalogWithRow(recipe_row),
    )
    monkeypatch.setattr("recipe_search_agent.discovery_tools.get_commerce_user_id", lambda: "user-321")
    monkeypatch.setattr("recipe_search_agent.discovery_tools.resolve_recipe_price", lambda _rid: (499, "USD"))

    mandate = {
        "id": "mandate-2",
        "user_id": "user-321",
        "session_id": "sess-2",
        "ceiling_amount": 300,
        "currency_code": "USD",
        "consumed_amount": 200,
        "status": "active",
        "source": "voice",
    }

    class _FakeSpendMandateService:
        def can_charge(self, user_id, amount):
            assert user_id == "user-321"
            assert amount == 499
            return False, mandate, "exceeds_ceiling"

    monkeypatch.setattr(
        "recipe_search_agent.discovery_tools.SpendMandateService",
        lambda: _FakeSpendMandateService(),
    )

    payload = json.loads(request_supertab_unlock("basic-tomato-sauce"))

    assert payload["ok"] is True
    assert payload["auto_charge"] is False
    assert payload["mandate"]["id"] == "mandate-2"
    assert payload["remaining_amount"] == 100
    assert payload["guidance"] == "Ask: Mind if I put this on your Tab? Yes / Not now."
