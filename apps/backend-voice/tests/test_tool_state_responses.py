"""Tests for state-aware tool responses in recipe tools.

These tests validate that tools return state-aware responses with:
1. Clear status codes ([DONE], [BLOCKED], [WAIT], [INFO], [ERROR])
2. Current state context
3. Suggested next actions

See apps/backend-voice/src/tools/TOOL_RESPONSE_FORMAT.md for standards.
"""

import pytest
from src.recipe_engine import StepStatus, Recipe, RecipeEngine
from src.services import session_service
from src.services.tool_runner import run_recipe_tool


class TestStateContextHelpers:
    """Test state context helper functions."""
    
    def test_build_state_context(self, parallel_recipe_engine):
        """Test that _build_state_context returns correct structure."""
        from src.tools.recipe_tools import _build_state_context
        
        context = _build_state_context(parallel_recipe_engine)
        
        assert "active" in context
        assert "ready" in context
        assert "waiting" in context
        assert "completed_count" in context
        assert "total_count" in context
        assert isinstance(context["active"], list)
        assert isinstance(context["ready"], list)
    
    def test_format_step_brief(self):
        """Test step brief formatting."""
        from src.tools.recipe_tools import _format_step_brief
        
        immediate_step = {"id": "chop", "descr": "Chop onions", "type": "immediate"}
        timer_step = {"id": "roast", "descr": "Roast squash", "type": "timer"}
        
        immediate_result = _format_step_brief(immediate_step)
        timer_result = _format_step_brief(timer_step)
        
        assert "Chop onions" in immediate_result
        assert "(timer)" not in immediate_result  # no tag for immediate
        assert "Roast squash" in timer_result
        assert "(timer)" in timer_result  # has tag for timer
    
    def test_build_blocked_response(self):
        """Test blocked response formatting."""
        from src.tools.recipe_tools import _build_blocked_response
        
        context = {
            "active": [{"id": "preheat", "descr": "Preheat oven", "type": "immediate"}],
            "ready": [],
            "waiting": [],
            "completed_count": 0,
            "total_count": 5
        }
        
        response = _build_blocked_response(
            action="start new step",
            reason="Cannot start while another step is active.",
            context=context,
            suggested_action="Call confirm_step_done('preheat') first."
        )
        
        assert "[BLOCKED]" in response
        assert "Cannot start" in response
        assert "ACTIVE" in response
        assert "confirm_step_done" in response


class TestStartStepResponses:
    """Test start_step() state-aware responses."""
    
    @pytest.mark.asyncio
    async def test_start_step_blocked_by_active(self, parallel_steps_recipe_data):
        """Test that start_step returns BLOCKED when active step exists."""
        from src.tools.recipe_tools import start_step
        
        recipe = Recipe.from_dict(parallel_steps_recipe_data)
        session_id = "test-start-blocked"
        engine = session_service.get_session_manager().create_session(session_id, recipe, None)
        
        # Start recipe - preheat_oven becomes ACTIVE
        await engine.start()
        
        # Try to start another step while preheat_oven is active
        result = await run_recipe_tool(session_id, start_step, step_id="roast_squash")
        
        assert "[BLOCKED]" in result
        assert "preheat_oven" in result.lower() or "Preheat" in result
        assert "confirm_step_done" in result
        
        await session_service.cleanup_session(session_id)
    
    @pytest.mark.asyncio
    async def test_start_step_success_immediate(self, parallel_steps_recipe_data):
        """Test successful start of immediate step."""
        from src.tools.recipe_tools import start_step
        
        recipe = Recipe.from_dict(parallel_steps_recipe_data)
        session_id = "test-start-immediate"
        engine = session_service.get_session_manager().create_session(session_id, recipe, None)
        
        # Start recipe and complete preheat_oven
        await engine.start()
        await engine.confirm_step_done("preheat_oven")
        
        # Now prep_veg should be ready
        result = await run_recipe_tool(session_id, start_step, step_id="prep_veg")
        
        assert "[STARTED]" in result
        assert "prep_veg" in result.lower() or "Prep" in result
        assert "confirm_step_done" in result
        
        await session_service.cleanup_session(session_id)
    
    @pytest.mark.asyncio
    async def test_start_step_success_timer(self, parallel_steps_recipe_data):
        """Test successful start of timer step shows STARTED (timer NOT auto-started).
        
        With timer decoupling, starting a timer step activates it but does NOT
        start the timer. The agent must call start_timer_for_step() separately.
        """
        from src.tools.recipe_tools import start_step, start_timer_for_step
        
        recipe = Recipe.from_dict(parallel_steps_recipe_data)
        session_id = "test-start-timer"
        engine = session_service.get_session_manager().create_session(session_id, recipe, None)
        
        # Start recipe and complete preheat_oven
        await engine.start()
        await engine.confirm_step_done("preheat_oven")
        
        # roast_squash is a timer step - starting it does NOT auto-start timer
        result = await run_recipe_tool(session_id, start_step, step_id="roast_squash")
        
        # Timer decoupling: start_step returns [STARTED], not [TIMER RUNNING]
        assert "[STARTED]" in result
        assert "timer available" in result.lower() or "timer not started" in result.lower()
        
        # Now explicitly start the timer
        timer_result = await run_recipe_tool(session_id, start_timer_for_step, step_id="roast_squash")
        
        # NOW we should see TIMER RUNNING
        assert "[TIMER RUNNING]" in timer_result
        assert "50 minute" in timer_result or "roast_squash" in timer_result.lower()
        
        await session_service.cleanup_session(session_id)


class TestConfirmStepDoneResponses:
    """Test confirm_step_done() state-aware responses."""
    
    @pytest.mark.asyncio
    async def test_confirm_ready_step_returns_blocked(self, parallel_steps_recipe_data):
        """Test that confirm_step_done returns BLOCKED for READY steps."""
        from src.tools.recipe_tools import confirm_step_done
        
        recipe = Recipe.from_dict(parallel_steps_recipe_data)
        session_id = "test-confirm-ready"
        engine = session_service.get_session_manager().create_session(session_id, recipe, None)
        
        # Start recipe and complete preheat_oven so roast_squash becomes READY
        await engine.start()
        await engine.confirm_step_done("preheat_oven")
        
        # Verify roast_squash is READY
        assert engine.recipe.steps["roast_squash"].status == StepStatus.READY
        
        # Try to confirm roast_squash while it's READY (not started)
        result = await run_recipe_tool(session_id, confirm_step_done, step_id="roast_squash")
        
        assert "[BLOCKED]" in result
        assert "READY" in result
        assert "start_step" in result
        
        await session_service.cleanup_session(session_id)
    
    @pytest.mark.asyncio
    async def test_confirm_active_step_returns_done(self, parallel_steps_recipe_data):
        """Test that confirm_step_done returns DONE for ACTIVE steps."""
        from src.tools.recipe_tools import confirm_step_done
        
        recipe = Recipe.from_dict(parallel_steps_recipe_data)
        session_id = "test-confirm-active"
        engine = session_service.get_session_manager().create_session(session_id, recipe, None)
        
        # Start recipe - preheat_oven is ACTIVE
        await engine.start()
        
        result = await run_recipe_tool(session_id, confirm_step_done, step_id="preheat_oven")
        
        assert "[DONE]" in result
        
        await session_service.cleanup_session(session_id)
    
    @pytest.mark.asyncio
    async def test_confirm_returns_next_step_info(self, parallel_steps_recipe_data):
        """Test that DONE response includes next step information."""
        from src.tools.recipe_tools import confirm_step_done
        
        recipe = Recipe.from_dict(parallel_steps_recipe_data)
        session_id = "test-confirm-next"
        engine = session_service.get_session_manager().create_session(session_id, recipe, None)
        
        # Start recipe - preheat_oven is ACTIVE
        await engine.start()
        
        result = await run_recipe_tool(session_id, confirm_step_done, step_id="preheat_oven")
        
        assert "[DONE]" in result
        # Should mention next step(s) - this recipe has parallel steps so multiple ready
        assert "Next" in result or "steps ready" in result
        # For single next step, should include start_step
        # For multiple steps, lists options for user to choose (no start_step needed)
        # Both behaviors are correct depending on the recipe structure
        assert "roast_squash" in result or "prep_veg" in result  # Should mention available steps
        
        await session_service.cleanup_session(session_id)


class TestResponseFormatConsistency:
    """Test that all responses follow the format standards."""
    
    @pytest.mark.asyncio
    async def test_all_responses_have_status_codes(self, parallel_steps_recipe_data):
        """Test that responses consistently use status codes."""
        from src.tools.recipe_tools import start_step, confirm_step_done
        
        valid_codes = ["[DONE]", "[STARTED]", "[TIMER RUNNING]", "[BLOCKED]", "[WAIT]", "[INFO]", "[ERROR]"]
        
        recipe = Recipe.from_dict(parallel_steps_recipe_data)
        session_id = "test-status-codes"
        engine = session_service.get_session_manager().create_session(session_id, recipe, None)
        
        # Start recipe
        await engine.start()
        
        # Test start_step with no ready steps
        result1 = await run_recipe_tool(session_id, start_step, step_id="nonexistent")
        assert any(code in result1 for code in valid_codes), f"Response missing status code: {result1}"
        
        # Test confirm_step_done on active step
        result2 = await run_recipe_tool(session_id, confirm_step_done, step_id="preheat_oven")
        assert any(code in result2 for code in valid_codes), f"Response missing status code: {result2}"
        
        await session_service.cleanup_session(session_id)
    
    @pytest.mark.asyncio
    async def test_blocked_responses_include_current_and_action(self, parallel_steps_recipe_data):
        """Test that BLOCKED responses include Current: and Action: sections."""
        from src.tools.recipe_tools import start_step
        
        recipe = Recipe.from_dict(parallel_steps_recipe_data)
        session_id = "test-blocked-format"
        engine = session_service.get_session_manager().create_session(session_id, recipe, None)
        
        # Start recipe - preheat_oven becomes ACTIVE
        await engine.start()
        
        # Try to start a step when one is already active
        result = await run_recipe_tool(session_id, start_step, step_id="roast_squash")
        
        assert "[BLOCKED]" in result
        assert "Current:" in result
        assert "Action:" in result
        
        await session_service.cleanup_session(session_id)
