"""Timer and reminder management for recipe steps.

This module supports multiple concurrent timers that are decoupled from step state,
enabling parallel cooking workflows (e.g., roasting squash while doing prep work).
"""

import asyncio
import uuid
from typing import Dict, Optional, Callable, Any, List
from datetime import datetime

from ccai.core.logger import configure_logger
from .models import Event, EventType, RecipeStep, ActiveTimer
from .utils import parse_iso_duration

logger = configure_logger(__name__)


class TimerManager:
    """
    Manages multiple concurrent timers for recipe cooking.
    
    Timers are decoupled from step state:
    - A step can be ACTIVE without its timer running
    - Timers can run while the user is on other steps
    - Multiple timers can run concurrently (parallel cooking)
    """
    
    def __init__(self, event_emitter: Callable[[Event], Any]):
        """
        Initialize the timer manager.
        
        Args:
            event_emitter: Callback to emit events (async or sync)
        """
        self._event_emitter = event_emitter
        self._timer_tasks: Dict[str, asyncio.Task] = {}
        self._reminder_tasks: Dict[str, asyncio.Task] = {}
        self._active_timers: Dict[str, ActiveTimer] = {}  # All active timers
    
    # =========================================================================
    # PUBLIC API: Timer Operations
    # =========================================================================
    
    def start_timer(
        self,
        timer_id: str,
        step_id: Optional[str],
        label: str,
        duration_secs: int,
        on_complete: Optional[Callable] = None,
        step: Optional[RecipeStep] = None
    ) -> ActiveTimer:
        """
        Start a new timer (can be step-attached or custom).
        
        Args:
            timer_id: Unique identifier for the timer
            step_id: Optional step ID this timer is attached to
            label: Display label for the timer
            duration_secs: Duration in seconds
            on_complete: Optional callback when timer completes
            step: Optional RecipeStep for reminder configuration
            
        Returns:
            The created ActiveTimer instance
        """
        # Create timer object
        timer = ActiveTimer(
            id=timer_id,
            step_id=step_id,
            label=label,
            duration_secs=duration_secs,
            started_at=datetime.now(),
            remaining_secs=duration_secs
        )
        
        # Store timer
        self._active_timers[timer_id] = timer
        
        # Create async task
        timer_task = asyncio.create_task(
            self._run_timer(timer, on_complete, step)
        )
        self._timer_tasks[timer_id] = timer_task
        
        logger.info(f"Started timer '{timer_id}' for {duration_secs}s (step: {step_id or 'custom'})")
        
        return timer
    
    def start_timer_for_step(
        self,
        step: RecipeStep,
        on_complete: Optional[Callable] = None
    ) -> ActiveTimer:
        """
        Start a timer for a recipe step.
        
        Convenience method that extracts duration from step.
        
        Args:
            step: The recipe step to start timer for
            on_complete: Callback when timer completes
            
        Returns:
            The created ActiveTimer instance
        """
        if not step.duration:
            raise ValueError(f"Step {step.id} has no duration defined")
        
        duration_secs = parse_iso_duration(step.duration)
        timer_id = f"timer_{step.id}"
        
        return self.start_timer(
            timer_id=timer_id,
            step_id=step.id,
            label=step.descr,
            duration_secs=duration_secs,
            on_complete=on_complete,
            step=step
        )
    
    def start_custom_timer(
        self,
        label: str,
        duration_secs: int
    ) -> ActiveTimer:
        """
        Start a custom timer (not attached to any step).
        
        Args:
            label: Display label for the timer
            duration_secs: Duration in seconds
            
        Returns:
            The created ActiveTimer instance
        """
        timer_id = f"custom_{uuid.uuid4().hex[:8]}"
        
        return self.start_timer(
            timer_id=timer_id,
            step_id=None,
            label=label,
            duration_secs=duration_secs
        )
    
    def cancel_timer(self, timer_id: str, emit_event: bool = True) -> bool:
        """
        Cancel a running timer.
        
        Args:
            timer_id: The timer to cancel
            emit_event: Whether to emit TIMER_CANCELLED event
            
        Returns:
            True if timer was cancelled, False if not found
        """
        if timer_id not in self._timer_tasks:
            return False
        
        # Cancel the task
        self._timer_tasks[timer_id].cancel()
        del self._timer_tasks[timer_id]
        
        # Get timer info before removing
        timer = self._active_timers.get(timer_id)
        
        # Remove from active timers
        if timer_id in self._active_timers:
            del self._active_timers[timer_id]
        
        logger.info(f"Cancelled timer: {timer_id}")
        
        # Emit cancellation event
        if emit_event and timer:
            asyncio.create_task(self._emit_event(Event(
                type=EventType.TIMER_CANCELLED,
                payload={
                    "timer_id": timer_id,
                    "step_id": timer.step_id,
                    "label": timer.label,
                    "remaining_secs": self._calculate_remaining(timer)
                }
            )))
            # Emit updated timer list
            asyncio.create_task(self._emit_timer_list_update())
        
        return True
    
    def cancel_timer_for_step(self, step_id: str, emit_event: bool = True) -> bool:
        """
        Cancel the timer attached to a step.
        
        Args:
            step_id: The step whose timer should be cancelled
            emit_event: Whether to emit TIMER_CANCELLED event
            
        Returns:
            True if timer was cancelled, False if not found
        """
        timer_id = f"timer_{step_id}"
        return self.cancel_timer(timer_id, emit_event)
    
    def has_active_timer_for_step(self, step_id: str) -> bool:
        """Check if a step has an active timer running."""
        timer_id = f"timer_{step_id}"
        return timer_id in self._active_timers
    
    def get_timer_for_step(self, step_id: str) -> Optional[ActiveTimer]:
        """Get the active timer for a step, if any."""
        timer_id = f"timer_{step_id}"
        timer = self._active_timers.get(timer_id)
        if timer:
            timer.remaining_secs = self._calculate_remaining(timer)
        return timer
    
    def get_all_active_timers(self) -> List[ActiveTimer]:
        """
        Get all currently active timers with updated remaining times.
        
        Returns:
            List of active timers sorted by remaining time
        """
        timers = []
        for timer in self._active_timers.values():
            timer.remaining_secs = self._calculate_remaining(timer)
            timers.append(timer)
        
        # Sort by remaining time (soonest first)
        return sorted(timers, key=lambda t: t.remaining_secs or 0)
    
    def get_timer_state(self, step_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the current state of a step's timer.
        
        Legacy method for backwards compatibility.
        """
        timer = self.get_timer_for_step(step_id)
        if not timer:
            return None
        
        return {
            "duration_secs": timer.duration_secs,
            "end_ts": (timer.started_at.timestamp() + timer.duration_secs),
            "remaining_secs": timer.remaining_secs,
        }
    
    # =========================================================================
    # LEGACY API: Backwards compatibility
    # =========================================================================
    
    def set_timer_metadata(self, step_id: str, duration_secs: int) -> None:
        """Legacy method - metadata is now part of ActiveTimer."""
        # This is now handled by start_timer, kept for compatibility
        pass
    
    def start_timer_task(
        self,
        step: RecipeStep,
        duration_secs: int,
        on_complete: Callable
    ) -> None:
        """Legacy method - use start_timer_for_step instead."""
        self.start_timer_for_step(step, on_complete)
    
    def cancel_reminders(self, step_id: str) -> None:
        """Cancel running reminders for a step."""
        timer_id = f"timer_{step_id}"
        if timer_id in self._reminder_tasks:
            self._reminder_tasks[timer_id].cancel()
            del self._reminder_tasks[timer_id]
            logger.info(f"Reminders cancelled for {step_id}")
    
    # =========================================================================
    # INTERNAL METHODS
    # =========================================================================
    
    def _calculate_remaining(self, timer: ActiveTimer) -> int:
        """Calculate remaining seconds for a timer."""
        elapsed = (datetime.now() - timer.started_at).total_seconds()
        return max(0, int(timer.duration_secs - elapsed))
    
    async def _run_timer(
        self,
        timer: ActiveTimer,
        on_complete: Optional[Callable],
        step: Optional[RecipeStep]
    ) -> None:
        """Run a timer until completion."""
        try:
            logger.info(f"Timer running: {timer.id} ({timer.duration_secs}s)")
            await asyncio.sleep(timer.duration_secs)
            
            # Timer completed
            logger.info(f"Timer completed: {timer.id}")
            
            # Emit TIMER_DONE event
            await self._emit_event(Event(
                type=EventType.TIMER_DONE,
                payload={
                    "timer_id": timer.id,
                    "step_id": timer.step_id,
                    "label": timer.label,
                    "requires_confirm": step.requires_confirm if step else True
                }
            ))
            
            # Remove from active timers
            if timer.id in self._active_timers:
                del self._active_timers[timer.id]
            if timer.id in self._timer_tasks:
                del self._timer_tasks[timer.id]
            
            # Emit updated timer list
            await self._emit_timer_list_update()
            
            # Start reminders if step requires confirmation
            if step and step.requires_confirm and step.reminder:
                reminder_secs = parse_iso_duration(step.reminder.get("every", "PT30S"))
                reminder_task = asyncio.create_task(
                    self._run_reminders(timer.id, timer.step_id, reminder_secs)
                )
                self._reminder_tasks[timer.id] = reminder_task
            
            # Call completion callback
            if on_complete:
                if asyncio.iscoroutinefunction(on_complete):
                    await on_complete(step) if step else await on_complete()
                else:
                    on_complete(step) if step else on_complete()
            
        except asyncio.CancelledError:
            logger.info(f"Timer cancelled: {timer.id}")
        except Exception as e:
            logger.error(f"Error in timer {timer.id}: {e}", exc_info=True)
    
    async def _run_reminders(
        self,
        timer_id: str,
        step_id: Optional[str],
        interval_secs: int
    ) -> None:
        """Send periodic reminders for a completed timer."""
        try:
            while True:
                await asyncio.sleep(interval_secs)
                await self._emit_event(Event(
                    type=EventType.REMINDER_TICK,
                    payload={
                        "timer_id": timer_id,
                        "step_id": step_id
                    }
                ))
        except asyncio.CancelledError:
            logger.info(f"Reminders cancelled for timer {timer_id}")
    
    async def _emit_event(self, event: Event) -> None:
        """Emit an event through the callback."""
        if asyncio.iscoroutinefunction(self._event_emitter):
            await self._event_emitter(event)
        else:
            self._event_emitter(event)
    
    async def _emit_timer_list_update(self) -> None:
        """Emit an event with the current list of active timers."""
        timers = self.get_all_active_timers()
        await self._emit_event(Event(
            type=EventType.TIMER_LIST_UPDATE,
            payload={
                "timers": [t.to_dict() for t in timers],
                "count": len(timers)
            }
        ))
    
    async def cancel_all(self) -> None:
        """Cancel all timers and reminders."""
        # Cancel all timer tasks
        for task in self._timer_tasks.values():
            task.cancel()
        
        # Cancel all reminder tasks
        for task in self._reminder_tasks.values():
            task.cancel()
        
        # Wait for all tasks to complete
        all_tasks = list(self._timer_tasks.values()) + list(self._reminder_tasks.values())
        if all_tasks:
            await asyncio.gather(*all_tasks, return_exceptions=True)
        
        self._timer_tasks.clear()
        self._reminder_tasks.clear()
        self._active_timers.clear()
        
        logger.info("All timers and reminders cancelled")
