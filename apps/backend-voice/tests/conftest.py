"""Pytest configuration and fixtures for recipe engine tests."""

import sys
from pathlib import Path

# Add ccai package to path
ccai_path = Path(__file__).parent.parent.parent.parent / "packages" / "ccai"
if str(ccai_path) not in sys.path:
    sys.path.insert(0, str(ccai_path))

import pytest
from typing import Dict, Any, AsyncGenerator, Optional
from unittest.mock import AsyncMock, MagicMock

from src.recipe_engine import Recipe, RecipeStep, RecipeEngine, StepStatus, EventType, Event


@pytest.fixture
def sample_recipe_data() -> Dict[str, Any]:
    """Sample recipe data for testing."""
    return {
        "recipe": {
            "id": "test-recipe",
            "title": "Test Recipe",
            "servings": 4,
            "estimated_total": "PT1H",
            "difficulty": "easy",
            "locale": "en"
        },
        "steps": [
            {
                "id": "step1",
                "descr": "First step",
                "type": "immediate",
                "auto_start": True,
                "requires_confirm": True,
                "next": ["step2", "step3"]
            },
            {
                "id": "step2",
                "descr": "Second step",
                "type": "timer",
                "depends_on": ["step1"],
                "auto_start": False,
                "duration": "PT5M",
                "requires_confirm": True
            },
            {
                "id": "step3",
                "descr": "Third step",
                "type": "immediate",
                "depends_on": ["step1"],
                "auto_start": True,
                "requires_confirm": True
            }
        ]
    }


@pytest.fixture
def parallel_steps_recipe_data() -> Dict[str, Any]:
    """Recipe data with parallel steps for testing."""
    return {
        "recipe": {
            "id": "parallel-test",
            "title": "Parallel Steps Test",
            "servings": 4,
            "estimated_total": "PT1H",
            "difficulty": "easy",
            "locale": "en"
        },
        "steps": [
            {
                "id": "preheat_oven",
                "descr": "Preheat oven",
                "type": "immediate",
                "auto_start": True,
                "requires_confirm": True,
                "next": ["roast_squash", "prep_veg"]
            },
            {
                "id": "roast_squash",
                "descr": "Roast squash",
                "type": "timer",
                "depends_on": ["preheat_oven"],
                "auto_start": False,
                "duration": "PT50M",
                "requires_confirm": True
            },
            {
                "id": "prep_veg",
                "descr": "Prep vegetables",
                "type": "immediate",
                "depends_on": ["preheat_oven"],
                "auto_start": True,
                "requires_confirm": True,
                "next": ["fry_rosemary"]
            },
            {
                "id": "fry_rosemary",
                "descr": "Fry rosemary",
                "type": "timer",
                "depends_on": ["prep_veg"],
                "auto_start": False,
                "duration": "PT1M",
                "requires_confirm": True
            }
        ]
    }


@pytest.fixture
def recipe(sample_recipe_data: Dict[str, Any]) -> Recipe:
    """Create a Recipe instance from sample data."""
    return Recipe.from_dict(sample_recipe_data)


@pytest.fixture
def parallel_recipe(parallel_steps_recipe_data: Dict[str, Any]) -> Recipe:
    """Create a Recipe instance with parallel steps."""
    return Recipe.from_dict(parallel_steps_recipe_data)


@pytest.fixture
def event_callback() -> AsyncMock:
    """Mock event callback function."""
    return AsyncMock()


@pytest.fixture
def recipe_engine(recipe: Recipe, event_callback: AsyncMock) -> RecipeEngine:
    """Create a RecipeEngine instance with a recipe and event callback."""
    return RecipeEngine(recipe=recipe, event_callback=event_callback)


@pytest.fixture
def parallel_recipe_engine(parallel_recipe: Recipe, event_callback: AsyncMock) -> RecipeEngine:
    """Create a RecipeEngine instance with parallel steps recipe."""
    return RecipeEngine(recipe=parallel_recipe, event_callback=event_callback)


@pytest.fixture
def mock_assistant():
    """Create a mock assistant with inject_system_message method."""
    assistant = MagicMock()
    assistant.inject_system_message = AsyncMock()
    return assistant


@pytest.fixture
def session_id() -> str:
    """Sample session ID for testing."""
    return "test-session-123"

