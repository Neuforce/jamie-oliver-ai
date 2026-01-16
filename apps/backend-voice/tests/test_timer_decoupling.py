"""
Tests for timer decoupling functionality.

Validates that timers can:
- Run independently of step state
- Support multiple concurrent timers
- Be cancelled without affecting step completion
"""

import pytest
import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from src.recipe_engine.timer_manager import (
    TimerManager,
    TimerNotFoundError,
    TimerAlreadyRunningError,
    TimerDurationError,
)
from src.recipe_engine.models import RecipeStep, StepStatus, Event, EventType


@pytest.fixture
def mock_event_emitter():
    """Create a mock event emitter that captures emitted events."""
    emitter = AsyncMock()
    emitter.events = []
    
    async def capture_event(event):
        emitter.events.append(event)
    
    emitter.side_effect = capture_event
    return emitter


@pytest.fixture
def timer_manager(mock_event_emitter):
    """Create a TimerManager with mock event emitter."""
    return TimerManager(mock_event_emitter)


@pytest.fixture
def sample_step():
    """Create a sample recipe step with timer."""
    return RecipeStep(
        id="roast_squash",
        descr="Roast the squash",
        type="timer",
        duration="PT50M",
        status=StepStatus.ACTIVE,
        requires_confirm=True,
    )


@pytest.fixture
def immediate_step():
    """Create a sample immediate step (no timer)."""
    return RecipeStep(
        id="prep_veg",
        descr="Prepare vegetables",
        type="immediate",
        status=StepStatus.ACTIVE,
        requires_confirm=True,
    )


@pytest.mark.asyncio
class TestTimerManager:
    """Tests for TimerManager functionality."""
    
    async def test_start_timer_creates_active_timer(self, timer_manager):
        """Timer is properly created and tracked."""
        timer = timer_manager.start_timer(
            timer_id="test_timer",
            step_id="step_1",
            label="Test Timer",
            duration_secs=60
        )
        
        assert timer.id == "test_timer"
        assert timer.step_id == "step_1"
        assert timer.label == "Test Timer"
        assert timer.duration_secs == 60
        assert timer.remaining_secs == 60
        # Clean up
        timer_manager.cancel_timer("test_timer", emit_event=False)
    
    async def test_start_timer_for_step(self, timer_manager, sample_step):
        """Timer created for a recipe step."""
        timer = timer_manager.start_timer_for_step(sample_step)
        
        assert timer.id == "timer_roast_squash"
        assert timer.step_id == "roast_squash"
        assert timer.label == "Roast the squash"
        assert timer.duration_secs == 50 * 60  # PT50M = 3000 seconds
        assert timer_manager.has_active_timer_for_step("roast_squash")
        # Clean up
        await timer_manager.cancel_all()
    
    async def test_start_timer_for_step_without_duration_raises(self, timer_manager, immediate_step):
        """Starting timer for step without duration raises error."""
        with pytest.raises(TimerDurationError) as exc_info:
            timer_manager.start_timer_for_step(immediate_step)
        
        assert exc_info.value.step_id == "prep_veg"
    
    async def test_start_duplicate_timer_raises(self, timer_manager, sample_step):
        """Starting timer when one already exists raises error."""
        timer_manager.start_timer_for_step(sample_step)
        
        with pytest.raises(TimerAlreadyRunningError) as exc_info:
            timer_manager.start_timer_for_step(sample_step)
        
        assert exc_info.value.step_id == "roast_squash"
        # Clean up
        await timer_manager.cancel_all()
    
    async def test_cancel_timer(self, timer_manager, sample_step):
        """Timer can be cancelled."""
        timer_manager.start_timer_for_step(sample_step)
        assert timer_manager.has_active_timer_for_step("roast_squash")
        
        result = timer_manager.cancel_timer_for_step("roast_squash", emit_event=False)
        
        assert result is True
        assert timer_manager.has_active_timer_for_step("roast_squash") is False
    
    async def test_cancel_nonexistent_timer_returns_false(self, timer_manager):
        """Cancelling non-existent timer returns False."""
        result = timer_manager.cancel_timer("nonexistent", emit_event=False)
        assert result is False
    
    async def test_cancel_nonexistent_timer_raises_when_requested(self, timer_manager):
        """Cancelling non-existent timer can raise error if requested."""
        with pytest.raises(TimerNotFoundError):
            timer_manager.cancel_timer("nonexistent", raise_if_not_found=True)
    
    async def test_multiple_concurrent_timers(self, timer_manager):
        """Multiple timers can run concurrently."""
        timer_manager.start_timer(
            timer_id="timer_1",
            step_id="step_1",
            label="First Timer",
            duration_secs=300
        )
        timer_manager.start_timer(
            timer_id="timer_2",
            step_id="step_2",
            label="Second Timer",
            duration_secs=600
        )
        timer_manager.start_custom_timer(
            label="Custom Timer",
            duration_secs=120
        )
        
        active_timers = timer_manager.get_all_active_timers()
        
        assert len(active_timers) == 3
        # Sorted by remaining time (soonest first)
        assert active_timers[0].duration_secs == 120  # Custom
        assert active_timers[1].duration_secs == 300  # First
        assert active_timers[2].duration_secs == 600  # Second
        # Clean up
        await timer_manager.cancel_all()
    
    async def test_get_timer_for_step(self, timer_manager, sample_step):
        """Can retrieve timer for specific step."""
        timer_manager.start_timer_for_step(sample_step)
        
        timer = timer_manager.get_timer_for_step("roast_squash")
        
        assert timer is not None
        assert timer.step_id == "roast_squash"
        # Clean up
        await timer_manager.cancel_all()
    
    async def test_get_timer_for_step_not_found(self, timer_manager):
        """Returns None for step without timer."""
        timer = timer_manager.get_timer_for_step("nonexistent")
        assert timer is None
    
    async def test_get_timer_state_legacy(self, timer_manager, sample_step):
        """Legacy get_timer_state method works."""
        timer_manager.start_timer_for_step(sample_step)
        
        state = timer_manager.get_timer_state("roast_squash")
        
        assert state is not None
        assert "duration_secs" in state
        assert "end_ts" in state
        assert "remaining_secs" in state
        # Clean up
        await timer_manager.cancel_all()


@pytest.mark.asyncio
class TestTimerDecoupling:
    """Tests for timer decoupling from step state."""
    
    async def test_timer_independent_of_step_status(self, timer_manager, sample_step):
        """Timer continues running regardless of step status changes."""
        timer_manager.start_timer_for_step(sample_step)
        
        # Simulate step completion - timer should still exist
        sample_step.status = StepStatus.COMPLETED
        
        # Timer is still active
        assert timer_manager.has_active_timer_for_step("roast_squash")
        retrieved_timer = timer_manager.get_timer_for_step("roast_squash")
        assert retrieved_timer is not None
        # Clean up
        await timer_manager.cancel_all()
    
    async def test_step_can_complete_while_timer_runs(self, timer_manager, sample_step):
        """Step can be marked complete while its timer is still running."""
        timer_manager.start_timer_for_step(sample_step)
        
        # Step transitions to completed
        sample_step.status = StepStatus.COMPLETED
        
        # Timer state is independent
        assert timer_manager.has_active_timer_for_step("roast_squash")
        
        # Timer can be explicitly cancelled
        timer_manager.cancel_timer_for_step("roast_squash", emit_event=False)
        assert not timer_manager.has_active_timer_for_step("roast_squash")
    
    async def test_multiple_step_timers_parallel(self, timer_manager):
        """Multiple steps can have active timers simultaneously."""
        step1 = RecipeStep(
            id="roast_squash",
            descr="Roast squash",
            type="timer",
            duration="PT50M",
            status=StepStatus.ACTIVE,
        )
        step2 = RecipeStep(
            id="simmer_stock",
            descr="Simmer stock",
            type="timer",
            duration="PT20M",
            status=StepStatus.ACTIVE,
        )
        
        timer_manager.start_timer_for_step(step1)
        timer_manager.start_timer_for_step(step2)
        
        assert timer_manager.has_active_timer_for_step("roast_squash")
        assert timer_manager.has_active_timer_for_step("simmer_stock")
        
        active = timer_manager.get_all_active_timers()
        assert len(active) == 2
        # Clean up
        await timer_manager.cancel_all()


@pytest.mark.asyncio
class TestTimerCompletion:
    """Tests for timer completion and events."""
    
    async def test_timer_emits_done_event(self, timer_manager, mock_event_emitter, sample_step):
        """Timer emits TIMER_DONE event when complete."""
        # Start a very short timer
        short_step = RecipeStep(
            id="quick_step",
            descr="Quick step",
            type="timer",
            duration="PT1S",  # 1 second
            status=StepStatus.ACTIVE,
            requires_confirm=True,
        )
        
        timer_manager.start_timer_for_step(short_step)
        
        # Wait for timer to complete
        await asyncio.sleep(1.5)
        
        # Check that TIMER_DONE was emitted
        done_events = [e for e in mock_event_emitter.events 
                      if e.type == EventType.TIMER_DONE]
        assert len(done_events) >= 1
        assert done_events[0].payload["step_id"] == "quick_step"
    
    async def test_cancelled_timer_no_done_event(self, timer_manager, mock_event_emitter, sample_step):
        """Cancelled timer doesn't emit TIMER_DONE."""
        timer_manager.start_timer_for_step(sample_step)
        
        # Cancel immediately
        timer_manager.cancel_timer_for_step("roast_squash", emit_event=True)
        
        # Wait a moment
        await asyncio.sleep(0.1)
        
        # Should have TIMER_CANCELLED but not TIMER_DONE
        event_types = [e.type for e in mock_event_emitter.events]
        assert EventType.TIMER_CANCELLED in event_types
        assert EventType.TIMER_DONE not in event_types
    
    async def test_cancel_all_timers(self, timer_manager):
        """All timers can be cancelled at once."""
        timer_manager.start_timer(
            timer_id="t1", step_id="s1", label="T1", duration_secs=100
        )
        timer_manager.start_timer(
            timer_id="t2", step_id="s2", label="T2", duration_secs=200
        )
        
        assert len(timer_manager.get_all_active_timers()) == 2
        
        await timer_manager.cancel_all()
        
        assert len(timer_manager.get_all_active_timers()) == 0
