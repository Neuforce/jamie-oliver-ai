import json

from recipe_search_agent.discovery_tools import get_recipe_details, set_search_agent


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


def test_get_recipe_details_returns_summary_only_payload():
    recipe_row = {
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

    payload = json.loads(get_recipe_details("basic-tomato-sauce"))
    recipe = payload["recipe"]

    assert recipe["recipe_id"] == "basic-tomato-sauce"
    assert recipe["title"] == "Basic Tomato Sauce"
    assert recipe["ingredient_count"] == 2
    assert recipe["step_count"] == 2
    assert recipe["ingredients"] == []
    assert recipe["steps"] == []
    assert recipe["next_step_hint"]
