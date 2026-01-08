"""Timer and reminder management for recipe steps."""

import asyncio
from typing import Dict, Optional, Callable, Any
from datetime import datetime

from ccai.core.logger import configure_logger
from .models import Event, EventType, RecipeStep
from .utils import parse_iso_duration

logger = configure_logger(__name__)


class TimerManager:
    """Manages timers and reminders for recipe steps."""
    
    def __init__(self, event_emitter: Callable[[Event], Any]):
        """
        Initialize the timer manager.
        
        Args:
            event_emitter: Callback to emit events (async or sync)
        """
        self._event_emitter = event_emitter
        self._timer_tasks: Dict[str, asyncio.Task] = {}
        self._reminder_tasks: Dict[str, asyncio.Task] = {}
        self._timers_meta: Dict[str, Dict[str, Any]] = {}
    
    def set_timer_metadata(self, step_id: str, duration_secs: int) -> None:
        """
        Set timer metadata (must be called before emitting events).
        
        Args:
            step_id: The step identifier
            duration_secs: Duration in seconds
        """
        self._timers_meta[step_id] = {
            "duration_secs": duration_secs,
            "end_ts": datetime.now().timestamp() + duration_secs,
        }
        logger.debug(f"Set timer metadata for {step_id}: {duration_secs}s")
    
    def start_timer_task(
        self,
        step: RecipeStep,
        duration_secs: int,
        on_complete: Callable
    ) -> None:
        """
        Start the timer task (call after metadata is set and events emitted).
        
        Args:
            step: The recipe step with timer
            duration_secs: Duration in seconds
            on_complete: Callback to invoke when timer completes
        """
        # Start timer task
        timer_task = asyncio.create_task(
            self._run_timer(step, duration_secs, on_complete)
        )
        self._timer_tasks[step.id] = timer_task
        logger.info(f"Started timer task for {step.id}: {duration_secs}s")
    
    def cancel_timer(self, step_id: str) -> None:
        """Cancel a running timer."""
        if step_id in self._timer_tasks:
            self._timer_tasks[step_id].cancel()
            del self._timer_tasks[step_id]
        
        if step_id in self._timers_meta:
            del self._timers_meta[step_id]
            logger.debug(f"Cleared timer metadata for {step_id}")
    
    def cancel_reminders(self, step_id: str) -> None:
        """Cancel running reminders for a step."""
        if step_id in self._reminder_tasks:
            self._reminder_tasks[step_id].cancel()
            del self._reminder_tasks[step_id]
    
    def get_timer_state(self, step_id: str) -> Optional[Dict[str, Any]]:
        """Get the current state of a timer."""
        meta = self._timers_meta.get(step_id)
        if not meta:
            return None
        
        end_ts = meta.get("end_ts")
        duration_secs = meta.get("duration_secs")
        remaining = max(0, int(end_ts - datetime.now().timestamp())) if end_ts else None
        
        return {
            "duration_secs": duration_secs,
            "end_ts": end_ts,
            "remaining_secs": remaining,
        }
    
    async def _run_timer(
        self,
        step: RecipeStep,
        duration_secs: int,
        on_complete: Callable
    ) -> None:
        """Run a timer for a step."""
        try:
            logger.info(f"Timer started for {step.id}: {duration_secs}s")
            await asyncio.sleep(duration_secs)
            
            await self._emit_event(Event(
                type=EventType.TIMER_DONE,
                payload={
                    "step_id": step.id,
                    "descr": step.descr,
                    "requires_confirm": step.requires_confirm
                }
            ))
            
            # Start reminders if confirmation is required
            if step.requires_confirm and step.reminder:
                reminder_secs = parse_iso_duration(step.reminder.get("every", "PT30S"))
                reminder_task = asyncio.create_task(
                    self._run_reminders(step.id, reminder_secs)
                )
                self._reminder_tasks[step.id] = reminder_task
            
            # Call completion callback
            await on_complete(step)
            
        except asyncio.CancelledError:
            logger.info(f"Timer cancelled for {step.id}")
        except Exception as e:
            logger.error(f"Error in timer for {step.id}: {e}", exc_info=True)
    
    async def _run_reminders(self, step_id: str, interval_secs: int) -> None:
        """Send periodic reminders for a step."""
        try:
            while True:
                await asyncio.sleep(interval_secs)
                await self._emit_event(Event(
                    type=EventType.REMINDER_TICK,
                    payload={"step_id": step_id}
                ))
        except asyncio.CancelledError:
            logger.info(f"Reminders cancelled for {step_id}")
    
    async def _emit_event(self, event: Event) -> None:
        """Emit an event through the callback."""
        if asyncio.iscoroutinefunction(self._event_emitter):
            await self._event_emitter(event)
        else:
            self._event_emitter(event)
    
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
        self._timers_meta.clear()

