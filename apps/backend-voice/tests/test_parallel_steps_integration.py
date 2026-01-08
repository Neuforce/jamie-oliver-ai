"""Integration tests for parallel steps flow."""

import pytest
from src.recipe_engine import StepStatus, EventType


@pytest.mark.asyncio
async def test_parallel_steps_full_flow(parallel_recipe_engine, event_callback):
    """Test full flow: preheat_oven -> both roast_squash and prep_veg become ready -> can start either."""
    engine = parallel_recipe_engine
    
    # Step 1: Start the recipe
    await engine.start()
    
    # Verify preheat_oven is active
    preheat = engine.recipe.steps["preheat_oven"]
    assert preheat.status == StepStatus.ACTIVE
    
    # Step 2: Confirm preheat_oven is done
    await engine.confirm_step_done("preheat_oven")
    
    # Verify preheat_oven is completed
    assert preheat.status == StepStatus.COMPLETED
    
    # Step 3: Verify both parallel steps are ready (not auto-started)
    roast = engine.recipe.steps["roast_squash"]
    prep = engine.recipe.steps["prep_veg"]
    
    assert roast.status == StepStatus.READY, "roast_squash should be READY"
    assert prep.status == StepStatus.READY, "prep_veg should be READY"
    assert roast.status != StepStatus.ACTIVE, "roast_squash should not auto-start"
    assert prep.status != StepStatus.ACTIVE, "prep_veg should not auto-start"
    
    # Step 4: Start roast_squash
    await engine.start_step("roast_squash")
    assert roast.status == StepStatus.ACTIVE
    assert prep.status == StepStatus.READY  # Still ready, can be started independently
    
    # Step 5: Start prep_veg (can be done in parallel)
    await engine.start_step("prep_veg")
    assert prep.status == StepStatus.ACTIVE
    assert roast.status == StepStatus.ACTIVE  # Both are now active
    
    # Step 6: Verify events were emitted correctly
    events = [call.args[0] for call in event_callback.call_args_list]
    
    # Should have STEP_READY events for both parallel steps
    ready_events = [e for e in events if e.type == EventType.STEP_READY]
    ready_step_ids = [e.payload["step_id"] for e in ready_events]
    assert "roast_squash" in ready_step_ids
    assert "prep_veg" in ready_step_ids
    
    # Should have STEP_START events when we explicitly start them
    start_events = [e for e in events if e.type == EventType.STEP_START]
    start_step_ids = [e.payload["step_id"] for e in start_events]
    assert "roast_squash" in start_step_ids
    assert "prep_veg" in start_step_ids

