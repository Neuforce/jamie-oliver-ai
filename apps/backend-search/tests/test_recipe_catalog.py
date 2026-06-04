"""Tests for PublishedRecipeCatalog."""

from recipe_search_agent.recipe_catalog import PublishedRecipeCatalog, reset_published_catalog_for_tests


class FakeRepo:
    def __init__(self, rows):
        self.rows = rows

    def list_recipes(self, *, status=None):
        if status != "published":
            return []
        return self.rows

    def get_recipe(self, slug):
        for row in self.rows:
            if row["slug"] == slug:
                return row
        return None


def test_catalog_filters_unpublished():
    reset_published_catalog_for_tests()
    catalog = PublishedRecipeCatalog(
        repository=FakeRepo(
            [
                {"slug": "fish-chips-mushy-peas", "status": "published", "metadata": {}},
            ]
        )
    )
    assert catalog.is_published("fish-chips-mushy-peas")
    assert not catalog.is_published("fish-tacos")


def test_tool_result_filters_unknown_slugs():
    from recipe_search_agent.tool_result_events import tool_result_to_chat_events

    reset_published_catalog_for_tests()
    catalog = PublishedRecipeCatalog(
        repository=FakeRepo([{"slug": "pesto-pasta", "status": "published", "metadata": {}}])
    )
    # Prime singleton used inside tool_result_events
    import recipe_search_agent.recipe_catalog as mod

    mod._catalog = catalog

    events = tool_result_to_chat_events(
        "search_recipes",
        "call-1",
        {
            "recipes": [
                {"recipe_id": "pesto-pasta", "title": "Pesto Pasta"},
                {"recipe_id": "fish-tacos", "title": "Fish Tacos"},
            ]
        },
        response_id="resp-1",
    )
    assert len(events) == 1
    recipes = events[0].metadata["recipes"]
    assert len(recipes) == 1
    assert recipes[0]["recipe_id"] == "pesto-pasta"
    assert events[0].metadata["tool_call_id"] == "call-1"
    assert events[0].metadata["response_id"] == "resp-1"
