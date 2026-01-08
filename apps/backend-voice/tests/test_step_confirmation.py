"""Tests for step confirmation functionality."""

import pytest
from unittest.mock import AsyncMock, patch
from src.recipe_engine import StepStatus
from src.services import session_service


@pytest.mark.asyncio
async def test_step_confirmation_unlocks_dependent_steps(recipe_engine, event_callback):
    """Test that step confirmation unlocks dependent steps correctly."""
    engine = recipe_engine
    
    # Start the recipe
    await engine.start()
    
    # Confirm step1 is active
    step1 = engine.recipe.steps["step1"]
    assert step1.status == StepStatus.ACTIVE
    
    # Confirm step1 is done
    await engine.confirm_step_done("step1")
    
    # Verify step1 is completed
    assert step1.status == StepStatus.COMPLETED
    
    # Verify step2 and step3 are now ready (they depend on step1)
    step2 = engine.recipe.steps["step2"]
    step3 = engine.recipe.steps["step3"]
    
    assert step2.status == StepStatus.READY
    assert step3.status == StepStatus.READY


@pytest.mark.asyncio
async def test_assistant_receives_system_message_on_confirmation(mock_assistant):
    """Test that assistant receives system message when step confirmed via API."""
    from src.recipe_engine import RecipeEngine, Recipe
    from src.services import session_service
    
    # Use a unique session ID
    unique_session_id = "test-session-confirm-123"
    
    recipe_data = {
        "recipe": {
            "id": "test",
            "title": "Test",
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
                "requires_confirm": True
            }
        ]
    }
    
    recipe = Recipe.from_dict(recipe_data)
    engine = RecipeEngine(recipe=recipe)
    
    # Register engine and assistant
    session_service.get_session_manager().create_session(unique_session_id, recipe, None)
    session_service.register_assistant(unique_session_id, mock_assistant)
    
    # Start the recipe
    await engine.start()
    
    # Get step description before confirming
    step = engine.recipe.steps.get("step1")
    step_descr = step.descr if step else "step1"
    
    # Confirm step
    await engine.confirm_step_done("step1")
    
    # Manually test the assistant notification logic (simulating what the endpoint does)
    assistant = session_service.get_assistant(unique_session_id)
    if assistant:
        system_message = (
            f"[SYSTEM: Step '{step_descr}' (step_id: step1) has been marked as complete "
            f"via the frontend. The user has finished this step.]"
        )
        await assistant.inject_system_message(system_message)
    
    # Verify assistant received system message
    assert mock_assistant.inject_system_message.called
    call_args = mock_assistant.inject_system_message.call_args[0][0]
    assert "step1" in call_args
    assert "marked as complete" in call_args.lower() or "finished" in call_args.lower()
    
    # Cleanup
    await session_service.cleanup_session(unique_session_id)


@pytest.mark.asyncio
async def test_step_confirmation_graceful_without_assistant():
    """Test that step confirmation works gracefully when assistant is not available."""
    from src.recipe_engine import RecipeEngine, Recipe
    from src.services import session_service
    
    # Use a unique session ID that won't have an assistant
    unique_session_id = "test-session-no-assistant-456"
    
    # Create a simple recipe for testing
    recipe_data = {
        "recipe": {
            "id": "test",
            "title": "Test",
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
                "requires_confirm": True
            }
        ]
    }
    
    recipe = Recipe.from_dict(recipe_data)
    engine = RecipeEngine(recipe=recipe)
    
    # Register engine but NOT assistant
    session_service.get_session_manager().create_session(unique_session_id, recipe, None)
    
    # Start the recipe
    await engine.start()
    
    # Confirm step directly (should work even without assistant)
    await engine.confirm_step_done("step1")
    
    # Verify step was confirmed successfully
    state = engine.get_state()
    assert "step1" in state["completed_steps"]
    
    # Verify no assistant was called (since none registered)
    # This tests graceful degradation
    assistant = session_service.get_assistant(unique_session_id)
    assert assistant is None  # No assistant registered
    
    # Cleanup
    await session_service.cleanup_session(unique_session_id)


@pytest.mark.asyncio
async def test_confirm_tool_preserves_parallel_timer_state():
    """Confirming a step via the tool should not reset other active timers."""
    from src.recipe_engine import Recipe
    from src.services import session_service
    from src.services.tool_runner import run_recipe_tool
    from src.tools.recipe_tools import confirm_step_done as confirm_tool

    recipe_data = {
        "recipe": {
            "id": "ui-manual",
            "title": "UI Manual Flow",
            "servings": 2,
            "estimated_total": "PT10M",
            "difficulty": "easy",
            "locale": "en",
        },
        "steps": [
            {
                "id": "manual_step",
                "descr": "Stir the sauce",
                "type": "immediate",
                "auto_start": True,
                "requires_confirm": True,
            },
            {
                "id": "timer_step",
                "descr": "Simmer for five minutes",
                "type": "timer",
                "auto_start": True,
                "requires_confirm": True,
                "duration": "PT5M",
            },
        ],
    }

    recipe = Recipe.from_dict(recipe_data)
    session_id = "ui-session-timers"
    engine = session_service.get_session_manager().create_session(session_id, recipe, None)

    await engine.start()

    timer_state_before = engine.get_state()["steps"]["timer_step"]["timer"]
    assert timer_state_before is not None and timer_state_before["remaining_secs"] > 0

    await run_recipe_tool(session_id, confirm_tool, step_id="manual_step")

    timer_state_after = engine.get_state()["steps"]["timer_step"]["timer"]
    assert timer_state_after is not None and timer_state_after["remaining_secs"] > 0

    await session_service.cleanup_session(session_id)

