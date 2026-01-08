"""Tests for parallel steps behavior in recipe engine."""

import pytest
from src.recipe_engine import StepStatus, EventType


@pytest.mark.asyncio
async def test_parallel_steps_become_ready(parallel_recipe_engine, event_callback):
    """Test that steps with same dependencies both become READY."""
    engine = parallel_recipe_engine
    
    # Start the recipe
    await engine.start()
    
    # Verify preheat_oven is ready and started
    preheat_step = engine.recipe.steps["preheat_oven"]
    assert preheat_step.status == StepStatus.ACTIVE
    
    # Confirm preheat_oven is done
    await engine.confirm_step_done("preheat_oven")
    
    # Verify both roast_squash and prep_veg become READY (not just one)
    roast_step = engine.recipe.steps["roast_squash"]
    prep_step = engine.recipe.steps["prep_veg"]
    
    assert roast_step.status == StepStatus.READY, "roast_squash should be READY"
    assert prep_step.status == StepStatus.READY, "prep_veg should be READY"
    
    # Verify STEP_READY events were emitted for both
    events = [call.args[0] for call in event_callback.call_args_list]
    ready_events = [e for e in events if e.type == EventType.STEP_READY]
    ready_step_ids = [e.payload["step_id"] for e in ready_events]
    
    assert "roast_squash" in ready_step_ids, "Should emit STEP_READY for roast_squash"
    assert "prep_veg" in ready_step_ids, "Should emit STEP_READY for prep_veg"


@pytest.mark.asyncio
async def test_parallel_steps_no_auto_start(parallel_recipe_engine, event_callback):
    """Test that auto-start doesn't trigger when multiple parallel steps become ready."""
    engine = parallel_recipe_engine
    
    # Start the recipe
    await engine.start()
    
    # Confirm preheat_oven is done
    await engine.confirm_step_done("preheat_oven")
    
    # Verify both steps are READY but neither is ACTIVE (no auto-start)
    roast_step = engine.recipe.steps["roast_squash"]
    prep_step = engine.recipe.steps["prep_veg"]
    
    assert roast_step.status == StepStatus.READY
    assert prep_step.status == StepStatus.READY
    assert roast_step.status != StepStatus.ACTIVE, "roast_squash should not auto-start"
    assert prep_step.status != StepStatus.ACTIVE, "prep_veg should not auto-start"
    
    # Verify no STEP_START events were emitted (since auto-start was deferred)
    events = [call.args[0] for call in event_callback.call_args_list]
    start_events = [e for e in events if e.type == EventType.STEP_START]
    start_step_ids = [e.payload["step_id"] for e in start_events]
    
    assert "roast_squash" not in start_step_ids, "roast_squash should not auto-start"
    assert "prep_veg" not in start_step_ids, "prep_veg should not auto-start"


@pytest.mark.asyncio
async def test_parallel_steps_can_start_independently(parallel_recipe_engine, event_callback):
    """Test that both parallel steps can be started independently."""
    engine = parallel_recipe_engine
    
    # Start the recipe and confirm preheat_oven
    await engine.start()
    await engine.confirm_step_done("preheat_oven")
    
    # Start roast_squash
    await engine.start_step("roast_squash")
    roast_step = engine.recipe.steps["roast_squash"]
    assert roast_step.status == StepStatus.ACTIVE
    
    # prep_veg should still be READY (can be started independently)
    prep_step = engine.recipe.steps["prep_veg"]
    assert prep_step.status == StepStatus.READY
    
    # Now start prep_veg as well
    await engine.start_step("prep_veg")
    prep_step = engine.recipe.steps["prep_veg"]
    assert prep_step.status == StepStatus.ACTIVE
    
    # Both should now be active
    assert roast_step.status == StepStatus.ACTIVE
    assert prep_step.status == StepStatus.ACTIVE


@pytest.mark.asyncio
async def test_single_step_auto_starts(recipe_engine, event_callback):
    """Test that a single step with auto_start=True does auto-start when it becomes ready."""
    engine = recipe_engine
    
    # Start the recipe
    await engine.start()
    
    # step1 should auto-start (it's the only initial step)
    step1 = engine.recipe.steps["step1"]
    assert step1.status == StepStatus.ACTIVE
    
    # Confirm step1
    await engine.confirm_step_done("step1")
    
    # step2 and step3 both depend on step1, so neither should auto-start
    step2 = engine.recipe.steps["step2"]
    step3 = engine.recipe.steps["step3"]
    
    # Both should be READY but not ACTIVE (multiple parallel steps)
    assert step2.status == StepStatus.READY
    assert step3.status == StepStatus.READY
    assert step2.status != StepStatus.ACTIVE
    assert step3.status != StepStatus.ACTIVE

