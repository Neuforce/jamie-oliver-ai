"""Core recipe execution engine."""

from __future__ import annotations
import asyncio
from typing import Dict, List, Optional, Any, Set, Callable

from ccai.core.logger import configure_logger
from .models import (
    StepStatus,
    EventType,
    Event,
    RecipeStep,
    Recipe,
    ActiveTimer,
)
from .utils import parse_iso_duration
from .timer_manager import TimerManager

logger = configure_logger(__name__)


class RecipeEngine:
    """
    Recipe execution engine that manages step progression and events.
    
    This engine handles:
    - Step lifecycle (pending → ready → active → completed)
    - Dependency resolution (DAG-based)
    - Timer and reminder coordination
    - Event emission for state changes
    """

    def __init__(self, recipe: Recipe, event_callback: Optional[Callable] = None):
        """
        Initialize the recipe engine.
        
        Args:
            recipe: The recipe to execute
            event_callback: Optional async callback function for events
        """
        self.recipe = recipe
        self.event_callback = event_callback
        self._completed: Set[str] = set()
        self._running = False
        
        # Initialize timer manager
        self._timer_manager = TimerManager(event_emitter=self._emit_event)

    async def start(self) -> None:
        """Start the recipe execution."""
        self._running = True
        logger.info(f"Starting recipe: {self.recipe.title}")
        
        # Find initial steps (no dependencies)
        initial_steps = [
            step for step in self.recipe.steps.values()
            if not step.depends_on
        ]
        
        if not initial_steps:
            await self._emit_event(Event(
                type=EventType.ERROR,
                payload={"msg": "No initial steps found in recipe"}
            ))
            return
        
        # Mark initial steps as ready and start if auto_start
        for step in initial_steps:
            await self._set_status(step, StepStatus.READY)
            await self._emit_event(Event(
                type=EventType.STEP_READY,
                payload={"step_id": step.id, "descr": step.descr}
            ))
            
            if step.auto_start:
                await self.start_step(step.id)

    async def start_step(self, step_id: str) -> None:
        """
        Start a specific step (does NOT auto-start timers).
        
        For timer steps, the agent should explicitly call start_timer_for_step()
        after the user confirms they are ready. This enables parallel cooking
        workflows where the user can navigate between steps while timers run.
        
        Args:
            step_id: The ID of the step to start
        """
        if step_id not in self.recipe.steps:
            logger.warning(f"Step {step_id} not found")
            return
        
        step = self.recipe.steps[step_id]
        
        if step.status != StepStatus.READY:
            logger.warning(f"Step {step_id} is not ready (status: {step.status})")
            return
        
        await self._set_status(step, StepStatus.ACTIVE)
        
        # Execute on_enter actions
        for action in step.on_enter:
            if "say" in action:
                await self._emit_event(Event(
                    type=EventType.MESSAGE,
                    payload={"step_id": step.id, "message": action["say"]}
                ))
        
        # Build event payload
        payload = {
            "step_id": step.id,
            "descr": step.descr,
            "type": step.type,
        }
        
        # Include timer info if this is a timer step (but don't start the timer)
        if step.type == "timer" and step.duration:
            duration_secs = parse_iso_duration(step.duration)
            payload["duration_secs"] = duration_secs
            payload["duration_str"] = step.duration
            payload["has_timer"] = True  # Signal that timer can be started
        
        await self._emit_event(Event(type=EventType.STEP_START, payload=payload))
        
        # NOTE: Timers are NO LONGER auto-started here!
        # The agent should call start_timer_for_step() when the user is ready.
        # This decouples step state from timer state for parallel cooking.
    
    async def start_timer_for_step(self, step_id: str) -> Optional[ActiveTimer]:
        """
        Explicitly start the timer for a step.
        
        This should be called when the user confirms they are ready for the timer.
        The step must be ACTIVE before its timer can be started.
        
        Args:
            step_id: The ID of the step to start the timer for
            
        Returns:
            The ActiveTimer instance if started, None if failed
        """
        if step_id not in self.recipe.steps:
            logger.warning(f"Step {step_id} not found")
            return None
        
        step = self.recipe.steps[step_id]
        
        if step.type != "timer" or not step.duration:
            logger.warning(f"Step {step_id} is not a timer step")
            return None
        
        if step.status != StepStatus.ACTIVE:
            logger.warning(f"Step {step_id} is not active (status: {step.status})")
            return None
        
        # Check if timer is already running
        if self._timer_manager.has_active_timer_for_step(step_id):
            logger.warning(f"Timer already running for step {step_id}")
            return self._timer_manager.get_timer_for_step(step_id)
        
        duration_secs = parse_iso_duration(step.duration)
        
        # Start the timer
        timer = self._timer_manager.start_timer_for_step(
            step=step,
            on_complete=self._on_timer_complete
        )
        
        # Emit timer events
        await self._emit_event(Event(
            type=EventType.TIMER_STARTED,
            payload={
                "timer_id": timer.id,
                "step_id": step.id,
                "label": step.descr,
                "duration_secs": duration_secs,
                "duration_str": step.duration
            }
        ))
        
        await self._emit_event(Event(
            type=EventType.TIMER_SET,
            payload={
                "step_id": step.id,
                "duration_secs": duration_secs,
                "duration_str": step.duration
            }
        ))
        
        logger.info(f"Timer started for step {step_id}: {duration_secs}s")
        return timer

    async def confirm_step_done(self, step_id: str, force_cancel_timer: bool = False) -> dict:
        """
        Confirm that a step is done and move to next steps.
        
        If the step has an active timer, returns a status indicating that
        confirmation is needed before cancelling (unless force_cancel_timer=True).
        
        Args:
            step_id: The ID of the step to confirm
            force_cancel_timer: If True, cancel any active timer without asking
            
        Returns:
            dict with status: 'completed', 'timer_active', or 'error'
        """
        if step_id not in self.recipe.steps:
            logger.warning(f"Step {step_id} not found")
            return {"status": "error", "message": f"Step {step_id} not found"}
        
        step = self.recipe.steps[step_id]
        
        if step.status not in (StepStatus.ACTIVE, StepStatus.WAITING_ACK):
            logger.warning(f"Step {step_id} cannot be confirmed (status: {step.status})")
            return {"status": "error", "message": f"Step {step_id} is not active"}
        
        # Check if there's an active timer for this step
        active_timer = self._timer_manager.get_timer_for_step(step_id)
        
        if active_timer and not force_cancel_timer:
            # Timer is still running - need confirmation
            return {
                "status": "timer_active",
                "message": f"Timer still has {active_timer.remaining_secs} seconds remaining",
                "timer_id": active_timer.id,
                "remaining_secs": active_timer.remaining_secs,
                "step_id": step_id
            }
        
        # Cancel any active timers/reminders
        self._timer_manager.cancel_reminders(step_id)
        if active_timer:
            self._timer_manager.cancel_timer(step_id, emit_event=True)
        
        await self._complete_step(step)
        return {"status": "completed", "step_id": step_id}

    async def _complete_step(self, step: RecipeStep) -> None:
        """Mark a step as completed and unlock dependent steps."""
        await self._set_status(step, StepStatus.COMPLETED)
        self._completed.add(step.id)
        
        await self._emit_event(Event(
            type=EventType.STEP_COMPLETED,
            payload={"step_id": step.id}
        ))
        
        logger.info(f"Step completed: {step.id}")
        
        # Collect all steps that will become ready
        steps_to_unlock = []
        for next_step_id in step.next:
            if next_step_id in self.recipe.steps:
                steps_to_unlock.append(next_step_id)
        
        # Unlock all dependent steps first (without auto-starting)
        newly_ready_steps = []
        for next_step_id in steps_to_unlock:
            if await self._check_and_unlock_step(next_step_id, defer_auto_start=True):
                newly_ready_steps.append(next_step_id)
        
        # If multiple steps became ready simultaneously, don't auto-start any
        # Only auto-start if exactly one step became ready and it has auto_start=True
        if len(newly_ready_steps) == 1:
            ready_step_id = newly_ready_steps[0]
            ready_step = self.recipe.steps[ready_step_id]
            if ready_step.auto_start and ready_step.status == StepStatus.READY:
                await self.start_step(ready_step_id)
        elif len(newly_ready_steps) > 1:
            # Multiple parallel steps - don't auto-start, let user choose
            logger.info(f"Multiple steps became ready simultaneously: {newly_ready_steps}. Deferring auto-start.")
        
        # Check if all steps are completed
        if len(self._completed) == len(self.recipe.steps):
            await self._emit_event(Event(
                type=EventType.ALL_COMPLETED,
                payload={"recipe_title": self.recipe.title}
            ))
            self._running = False

    async def _check_and_unlock_step(self, step_id: str, defer_auto_start: bool = False) -> bool:
        """
        Check if a step's dependencies are met and unlock it.
        
        Args:
            step_id: The step to check
            defer_auto_start: If True, don't auto-start even if step has auto_start=True
            
        Returns:
            True if step was unlocked (became ready), False otherwise
        """
        step = self.recipe.steps[step_id]
        
        if step.status != StepStatus.PENDING:
            return False
        
        # Check dependencies
        if step.unlock_when == "all":
            deps_met = all(dep in self._completed for dep in step.depends_on)
        else:  # "any"
            deps_met = any(dep in self._completed for dep in step.depends_on)
        
        if deps_met:
            await self._set_status(step, StepStatus.READY)
            await self._emit_event(Event(
                type=EventType.STEP_READY,
                payload={"step_id": step.id, "descr": step.descr}
            ))
            
            # Only auto-start if not deferred and step has auto_start enabled
            if step.auto_start and not defer_auto_start:
                await self.start_step(step.id)
            
            return True
        
        return False

    async def _on_timer_complete(self, step: RecipeStep) -> None:
        """Handle timer completion for a step."""
        if step.requires_confirm:
            # Set to waiting state - user must confirm
            await self._set_status(step, StepStatus.WAITING_ACK)
        else:
            # Auto-complete if no confirmation required
            await self.confirm_step_done(step.id)

    async def _set_status(self, step: RecipeStep, status: StepStatus) -> None:
        """Update a step's status."""
        step.status = status
        logger.debug(f"Step {step.id} status: {status.value}")

    async def _emit_event(self, event: Event) -> None:
        """Emit an event to the callback if configured."""
        logger.info(f"🔔 Recipe Event Emitted: {event.type.value} - {event.payload}")
        
        if self.event_callback:
            try:
                if asyncio.iscoroutinefunction(self.event_callback):
                    await self.event_callback(event)
                else:
                    self.event_callback(event)
                logger.info(f"✅ Event callback executed successfully for {event.type.value}")
            except Exception as e:
                logger.error(f"❌ Error in event callback: {e}", exc_info=True)
        else:
            logger.warning(f"⚠️  No event callback configured, event not sent: {event.type.value}")

    def get_state(self) -> Dict[str, Any]:
        """Get the current state of the recipe execution."""
        state = {
            "recipe_id": self.recipe.id,
            "recipe_title": self.recipe.title,
            "running": self._running,
            "completed_steps": list(self._completed),
            "steps": {
                step_id: {
                    "id": step.id,
                    "descr": step.descr,
                    "status": step.status.value,
                    "type": step.type,
                    "depends_on": step.depends_on,
                    "next": step.next,
                    "timer": self._timer_manager.get_timer_state(step_id)
                }
                for step_id, step in self.recipe.steps.items()
            },
            "active_timers": [t.to_dict() for t in self._timer_manager.get_all_active_timers()]
        }
        return state
    
    def get_active_timers(self) -> List[ActiveTimer]:
        """Get all currently active timers."""
        return self._timer_manager.get_all_active_timers()
    
    def has_active_timer_for_step(self, step_id: str) -> bool:
        """Check if a step has an active timer running."""
        return self._timer_manager.has_active_timer_for_step(step_id)
    
    async def cancel_timer_for_step(self, step_id: str) -> bool:
        """
        Cancel the timer for a step without completing the step.
        
        Args:
            step_id: The step whose timer should be cancelled
            
        Returns:
            True if timer was cancelled, False if not found
        """
        return self._timer_manager.cancel_timer_for_step(step_id, emit_event=True)

    def get_active_steps(self) -> List[RecipeStep]:
        """Get all currently active steps."""
        return [
            step for step in self.recipe.steps.values()
            if step.status in (StepStatus.ACTIVE, StepStatus.WAITING_ACK)
        ]

    async def stop(self) -> None:
        """Stop the recipe engine and cancel all timers."""
        self._running = False
        await self._timer_manager.cancel_all()
        logger.info(f"Recipe engine stopped: {self.recipe.title}")

