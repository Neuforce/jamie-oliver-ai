"""Recipe Search Agent — semantic recipe search."""

from typing import TYPE_CHECKING

__all__ = ["RecipeSearchAgent", "SearchFilters", "RecipeMatch"]


def __getattr__(name: str):
    if name in __all__:
        from recipe_search_agent.search import RecipeMatch, RecipeSearchAgent, SearchFilters

        return {"RecipeSearchAgent": RecipeSearchAgent, "SearchFilters": SearchFilters, "RecipeMatch": RecipeMatch}[
            name
        ]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


if TYPE_CHECKING:
    from recipe_search_agent.search import RecipeMatch, RecipeSearchAgent, SearchFilters
