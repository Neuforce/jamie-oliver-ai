"""
Recipe tools for Jamie Oliver AI Cooking Assistant.
These tools handle recipe retrieval, navigation, and step management.
"""

import re
from typing import Dict, Any, Optional, List, Tuple

from ccai.core.function_manager import FunctionManager
from ccai.core.function_manager.decorators import register_function
from ccai.core.logger import configure_logger
from ccai.core import context_variables

from src.recipe_engine import Recipe, RecipeEngine, RecipeStep, parse_iso_duration, StepStatus
from src.services.session_service import session_service

logger = configure_logger(__name__)

# Create function manager
recipe_function_manager = FunctionManager()


def _get_session_id() -> Optional[str]:
    """
    Retrieve the current session_id from context variables.
    
    Returns:
        Session ID or None if not present
    """
    sid = context_variables.get("session_id")
    if not sid:
        logger.warning("No session_id found in context variables")
    return sid


def _get_engine(session_id: str) -> Optional[RecipeEngine]:
    """Get the recipe engine for a session."""
    return session_service.get_engine(session_id)


# Expose for backwards compatibility
def get_session_engine(session_id: str) -> Optional[RecipeEngine]:
    """Get the recipe engine for a session (public API)."""
    return _get_engine(session_id)


def set_event_callback(session_id: str, callback: callable):
    """Set the event callback for a session (public API)."""
    session_service.register_event_callback(session_id, callback)


async def _fast_forward_engine(engine: RecipeEngine, resume_index: int) -> None:
    """Mark steps before resume_index as completed so the engine continues from that step."""
    if resume_index <= 0:
        return

    step_ids = list(engine.recipe.steps.keys())
    target = min(resume_index, len(step_ids))

    for idx in range(target):
        step_id = step_ids[idx]
        step = engine.recipe.steps[step_id]

        if step.status == StepStatus.COMPLETED:
            continue

        if step.status == StepStatus.PENDING:
            await engine.start_step(step_id)

        if step.status == StepStatus.READY:
            await engine.start_step(step_id)

        if step.status in (StepStatus.ACTIVE, StepStatus.WAITING_ACK):
            await engine.confirm_step_done(step_id)

def _format_duration(seconds: int) -> str:
    """Return a human-friendly description for a duration in seconds."""
    if seconds <= 0:
        return "a moment"
    minutes, secs = divmod(seconds, 60)
    parts = []
    if minutes:
        parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
    if secs:
        parts.append(f"{secs} second{'s' if secs != 1 else ''}")
    return " ".join(parts)


@register_function(recipe_function_manager)
async def start_recipe(
    recipe_id: str = "",
    recipe_payload: dict = None,
    resume_step_index: int = -1,
) -> str:
    """
    Start a recipe for this session.
    
    Args:
        recipe_id: Optional id (slug) of the recipe to start.
        recipe_payload: Full backend recipe JSON (same structure as /public/recipes/*.json).
            Required when launching from the cooking UI so the agent loads identical steps.
        resume_step_index: When provided, indicates which zero-based step index the user
            last completed so the agent can continue from there.
    
    Returns:
        A summary of the recipe and confirmation that it's starting
    """
    session_id = _get_session_id()
    if not session_id:
        return "Sorry, I couldn't determine your session. Please reconnect and try again."

    logger.info(f"Starting recipe for session {session_id}")
    payload_recipe_id = recipe_payload.get("recipe", {}).get("id") if recipe_payload else None
    target_recipe_id = recipe_id or payload_recipe_id or session_service.get_session_recipe(session_id)
    if not target_recipe_id:
        return (
            "I need a specific recipe_id to start cooking. "
            "Ask me for the recipe list and then call start_recipe with your choice."
        )

    session_service.set_session_recipe(session_id, target_recipe_id)
    if recipe_payload:
        session_service.set_session_recipe_payload(session_id, recipe_payload)

    payload = recipe_payload or session_service.get_session_recipe_payload(session_id)
    if not payload:
        return (
            "I don't have the full recipe details yet. Please open the recipe in the app "
            "and start cooking from there so I can receive the complete instructions."
        )

    try:
        recipe = Recipe.from_dict(payload)
        logger.info(f"Recipe loaded: {recipe.title} with {len(recipe.steps)} steps")
        
        # Get the event callback for this session
        event_callback = session_service.get_event_callback(session_id)
        logger.info(f"Event callback for session {session_id}: {event_callback is not None}")
        
        # Create a new recipe engine session
        engine = session_service.get_session_manager().create_session(
            session_id, recipe, event_callback
        )
        session_service.set_session_recipe(session_id, recipe.id)
        logger.info(f"Recipe engine created for session {session_id}")
        
        # Start the recipe engine (this will trigger initial steps)
        # Apply completed steps or resume index if provided
        await engine.start()

        if resume_step_index > 0:
            step_ids = list(recipe.steps.keys())
            target = min(resume_step_index, len(step_ids))
            logger.info(f"Fast-forwarding to step index {resume_step_index} (target {target})")

            for idx in range(target):
                step_id = step_ids[idx]
                step = engine.recipe.steps[step_id]

                if step.status == StepStatus.COMPLETED:
                    continue

                if step.status == StepStatus.PENDING:
                    await engine.start_step(step_id)

                if step.status == StepStatus.READY:
                    await engine.start_step(step_id)

                if step.status in (StepStatus.ACTIVE, StepStatus.WAITING_ACK):
                    await engine.confirm_step_done(step_id)
        logger.info(f"Recipe engine started for session {session_id}")
        
        # Build internal reference of all steps with IDs for the agent
        steps_summary = _build_steps_summary(recipe)
        
        return f"""Recipe loaded: {recipe.title}

INTERNAL STEP REFERENCE (use step_id in tools, don't show user this):
{chr(10).join(steps_summary)}

Remember: Guide naturally, don't expose technical details. I'll walk the user through step by step."""
        
    except Exception as e:
        logger.error(f"Error starting recipe: {e}", exc_info=True)
        return f"Sorry, there was an error starting the recipe: {str(e)}"
@register_function(recipe_function_manager)
async def list_available_recipes() -> str:
    """
    Provide guidance when the agent asks for recipes.

    Since the UI controls which recipe is active, the agent simply instructs
    the user to pick the recipe from the app.
    """
    return (
        "Browse the recipe gallery in the Jamie Oliver app and let me know which one you'd like to cook. "
        "Once you open a recipe there, I'll automatically receive the full instructions."
    )


@register_function(recipe_function_manager)
async def stop_recipe_session() -> str:
    """
    Stop the active recipe session so we can start something else.
    """
    session_id = _get_session_id()
    if not session_id:
        return "I couldn't determine your session. Please reconnect and try again."

    engine = _get_engine(session_id)
    if not engine:
        return "There is no active recipe session right now."

    await session_service.cleanup_session(session_id)
    return "Okay, I stopped the current recipe session. Let me know which recipe you'd like to cook next."


@register_function(recipe_function_manager)
async def start_kitchen_timer(duration_seconds: int = 0) -> str:
    """
    Start or resume the global kitchen timer in the UI.

    Args:
        duration_seconds: Optional duration in seconds. If omitted, the existing timer value is used.
    """
    session_id = _get_session_id()
    if not session_id:
        return "I couldn't determine your session. Please reconnect and try again."

    seconds = max(0, int(duration_seconds))
    try:
        await session_service.send_control_event(
            session_id,
            "timer_start",
            {"seconds": seconds} if seconds else None,
        )
        session_service.set_kitchen_timer_state(
            session_id, running=True, seconds=seconds if seconds else None
        )
        if seconds:
            return f"Starting a timer for {_format_duration(seconds)}."
        return "Starting the kitchen timer now."
    except Exception as exc:
        logger.error(f"Failed to start kitchen timer: {exc}", exc_info=True)
        return "Sorry, I couldn't start the timer."


@register_function(recipe_function_manager)
async def pause_kitchen_timer() -> str:
    """Pause the global kitchen timer in the UI."""
    session_id = _get_session_id()
    if not session_id:
        return "I couldn't determine your session. Please reconnect and try again."

    try:
        await session_service.send_control_event(session_id, "timer_pause")
        session_service.set_kitchen_timer_state(session_id, running=False)
        return "Pausing the timer."
    except Exception as exc:
        logger.error(f"Failed to pause kitchen timer: {exc}", exc_info=True)
        return "Sorry, I couldn't pause the timer."


@register_function(recipe_function_manager)
async def resume_kitchen_timer(duration_seconds: int = 0) -> str:
    """
    Resume the global kitchen timer in the UI.

    Args:
        duration_seconds: Optional duration override if the timer needs a new value.
    """
    session_id = _get_session_id()
    if not session_id:
        return "I couldn't determine your session. Please reconnect and try again."

    seconds = max(0, int(duration_seconds))
    try:
        await session_service.send_control_event(
            session_id,
            "timer_resume",
            {"seconds": seconds} if seconds else None,
        )
        session_service.set_kitchen_timer_state(
            session_id, running=True, seconds=seconds if seconds else None
        )
        if seconds:
            return f"Resuming the timer with {_format_duration(seconds)} remaining."
        return "Resuming the kitchen timer."
    except Exception as exc:
        logger.error(f"Failed to resume kitchen timer: {exc}", exc_info=True)
        return "Sorry, I couldn't resume the timer."


@register_function(recipe_function_manager)
async def reset_kitchen_timer(duration_seconds: int = 0) -> str:
    """
    Reset or stop the global kitchen timer in the UI.

    Args:
        duration_seconds: Optional duration to set after resetting.
    """
    session_id = _get_session_id()
    if not session_id:
        return "I couldn't determine your session. Please reconnect and try again."

    seconds = max(0, int(duration_seconds))
    try:
        await session_service.send_control_event(
            session_id,
            "timer_reset",
            {"seconds": seconds} if seconds else None,
        )
        session_service.set_kitchen_timer_state(
            session_id, running=False, seconds=seconds if seconds else None
        )
        if seconds:
            return f"Resetting the timer to {_format_duration(seconds)}."
        return "Timer reset."
    except Exception as exc:
        logger.error(f"Failed to reset kitchen timer: {exc}", exc_info=True)
        return "Sorry, I couldn't reset the timer."


def _build_steps_summary(recipe: Recipe) -> list[str]:
    """Build an internal step summary for the agent."""
    steps_summary = []
    
    # Build a map of steps by their dependencies for parallel detection
    steps_by_deps: Dict[tuple, list[RecipeStep]] = {}
    for step in recipe.steps.values():
        deps_key = tuple(sorted(step.depends_on)) if step.depends_on else tuple()
        if deps_key not in steps_by_deps:
            steps_by_deps[deps_key] = []
        steps_by_deps[deps_key].append(step)
    
    for step_id, step in recipe.steps.items():
        # Track parallel relationships internally
        parallel_note = ""
        if step.depends_on:
            deps_key = tuple(sorted(step.depends_on))
            siblings = [
                s for s in steps_by_deps.get(deps_key, [])
                if s.id != step.id
            ]
            if siblings:
                sibling_ids = [s.id for s in siblings]
                parallel_note = f" (CAN_DO_PARALLEL_WITH: {', '.join(sibling_ids)} - these steps share the same dependencies and can be done simultaneously or in any order)"
        
        timer_note = f" [TIMED:{step.duration}]" if step.type == "timer" else ""
        deps_note = f" (DEPENDS_ON: {', '.join(step.depends_on)})" if step.depends_on else ""
        
        steps_summary.append(
            f"• STEP_ID={step_id}: {step.descr}{timer_note}{deps_note}{parallel_note}"
        )
    
    return steps_summary


@register_function(recipe_function_manager)
async def get_current_step() -> str:
    """
    Get information about the current active step(s) in the recipe.
    
    Returns:
        Details about the current cooking step(s)
    """
    session_id = _get_session_id()
    if not session_id:
        return "I couldn't determine your session. Please reconnect and try again."

    engine = _get_engine(session_id)
    
    if not engine:
        return (
            "There's no active recipe yet. Open a recipe in the app and tell me when you're ready to cook it."
        )
    
    active_steps = engine.get_active_steps()
    state = engine.get_state()
    
    # Also get READY steps
    ready_steps = [s for s in state["steps"].values() if s["status"] == "ready"]
    
    if not active_steps and not ready_steps:
        if len(state["completed_steps"]) == len(state["steps"]):
            recipe_title = getattr(engine.recipe, "title", "Your dish")
            return f"All steps completed! {recipe_title} is ready to serve. Enjoy!"
        else:
            return "No active or ready steps right now. All current steps are either completed or waiting for dependencies."
    
    response_parts = []
    
    # Format active steps
    if active_steps:
        response_parts.append(_format_active_steps(active_steps))
    
    # Format ready steps
    if ready_steps:
        response_parts.append(_format_ready_steps(ready_steps))
    
    return "\n".join(response_parts)


def _format_active_steps(active_steps: list) -> str:
    """Format active steps for display."""
    if len(active_steps) == 1:
        step = active_steps[0]
        result = f"Active step: {step.descr}"
        if step.status.value == "waiting_ack":
            result += " (waiting for confirmation)"
        elif step.type == "timer" and step.duration:
            result += " (timer running)"
        return result
    else:
        parts = [f"{len(active_steps)} active steps:"]
        for i, step in enumerate(active_steps, 1):
            status_note = " (waiting for confirmation)" if step.status.value == "waiting_ack" else ""
            parts.append(f"{i}. {step.descr}{status_note}")
        return "\n".join(parts)


def _format_ready_steps(ready_steps: list) -> str:
    """Format ready steps for display."""
    parts = [f"\n{len(ready_steps)} step(s) ready to start:"]
    for i, step in enumerate(ready_steps, 1):
        parts.append(
            f"• STEP_ID={step['id']}: {step['descr']} (use start_step('{step['id']}') to begin)"
        )
    return "\n".join(parts)


@register_function(recipe_function_manager)
async def confirm_step_done(
    step_id: str = "",
    step_description: str = ""
) -> str:
    """
    Confirm that a cooking step is complete. Use this when the user indicates 
    they've finished a step (e.g., "done", "finished", "ready", "next").
    
    ALWAYS provide step_id for precision (e.g., "preheat_oven", "roast_squash").
    
    Args:
        step_id: The ID of the step to confirm (PREFERRED - use this!)
        step_description: Fallback description if step_id not known
        
    Returns:
        Confirmation and what happens next
    """
    session_id = _get_session_id()
    if not session_id:
        return "I couldn't determine your session. Please reconnect and try again."

    engine = _get_engine(session_id)
    
    if not engine:
        return "No recipe is in progress."
    
    active_steps = engine.get_active_steps()
    
    if not active_steps:
        return "There are no active steps to confirm right now."
    
    # Find the step to confirm
    step_to_confirm = _find_step_to_confirm(
        step_id, step_description, active_steps, engine.get_state()
    )
    
    if not step_to_confirm:
        return "No steps ready to confirm right now."
    
    # Confirm the step
    await engine.confirm_step_done(step_to_confirm.id)
    
    # Check what's available next
    state = engine.get_state()
    ready_steps = [s for s in state["steps"].values() if s["status"] == "ready"]
    
    return _build_confirmation_response(state, ready_steps)


def _find_step_to_confirm(
    step_id: str,
    step_description: str,
    active_steps: list,
    state: dict
) -> Optional[Any]:
    """Find the step to confirm based on ID or description."""
    # Try to match by step_id
    if step_id:
        for step in active_steps:
            if step.id == step_id:
                return step
        
        # Step ID provided but not active
        step_info = state["steps"].get(step_id)
        if step_info:
            logger.warning(
                f"Step '{step_id}' not active (status: {step_info['status']})"
            )
        return None
    
    # Try to match by description
    if step_description:
        step = _match_step_by_description(step_description, active_steps)
        if step:
            return step
    
    # Last resort: prioritize waiting_ack, then first active
    for step in active_steps:
        if step.status.value == "waiting_ack":
            return step
    
    return active_steps[0] if active_steps else None


def _match_step_by_description(description: str, steps: list) -> Optional[Any]:
    """Match a step by description using fuzzy matching."""
    desc_norm = description.lower()
    tokens = [t for t in re.split(r"[^a-zA-Z0-9]+", desc_norm) if t]
    
    # Try exact substring match first
    for step in steps:
        if desc_norm in step.descr.lower() or step.descr.lower() in desc_norm:
            return step
    
    # Fallback: keyword match
    for step in steps:
        sdesc = step.descr.lower()
        if any(t in sdesc for t in tokens):
            return step
    
    return None


def _build_confirmation_response(state: dict, ready_steps: list) -> str:
    """Build the confirmation response based on available next steps."""
    if ready_steps:
        if len(ready_steps) == 1:
            next_step = ready_steps[0]
            return (
                f"✓ Step complete! Next up: {next_step['descr']} "
                f"(step_id: {next_step['id']}). Ready to start?"
            )
        else:
            options = [
                f"{s['descr']} (step_id: {s['id']})" 
                for s in ready_steps[:3]
            ]
            return f"✓ Step complete! You can now do: {' OR '.join(options)}. Which one?"
    else:
        # Check if everything is done
        if len(state["completed_steps"]) == len(state["steps"]):
            return "✓ Step complete! That was the final step - recipe is done! 🎉"
        else:
            return "✓ Step complete! Waiting for other parallel steps to finish before we can continue."


@register_function(recipe_function_manager)
async def get_recipe_state() -> Dict[str, Any]:
    """
    Get the complete state of the recipe execution.
    This is useful for displaying progress in the UI.
    
    Returns:
        Dictionary containing the recipe state including all steps and their statuses
    """
    session_id = _get_session_id()
    if not session_id:
        return {"error": "No session available", "has_recipe": False}

    engine = _get_engine(session_id)
    
    if not engine:
        return {
            "error": "No recipe is in progress",
            "has_recipe": False
        }
    
    state = engine.get_state()
    state["has_recipe"] = True
    return state


@register_function(recipe_function_manager)
async def repeat_step() -> str:
    """
    Repeat the current cooking step instructions.
    
    Returns:
        The current step instructions again
    """
    return await get_current_step()


@register_function(recipe_function_manager)
async def start_step(step_id: str = "", step_description: str = "") -> str:
    """
    Explicitly start a READY step. Use when the user says they started a step
    (e.g., "the squash is in the oven"). If no step_id is provided, we try to
    match by description among READY steps.
    
    Args:
        step_id: Optional explicit step id to start
        step_description: Optional natural language hint to choose the step
        
    Returns:
        A short confirmation of the step started, or guidance if none is ready.
    """
    session_id = _get_session_id()
    if not session_id:
        return "I couldn't determine your session. Please reconnect and try again."

    engine = _get_engine(session_id)
    if not engine:
        return "No recipe is in progress."

    # Get current state
    state = engine.get_state()
    steps: Dict[str, Any] = state.get("steps", {})

    # Collect READY steps
    ready_steps = [s for s in steps.values() if s.get("status") == "ready"]
    if not ready_steps:
        return "No steps are ready to start right now."

    # Find the target step
    target = _find_step_to_start(step_id, step_description, ready_steps)
    
    if not target:
        names = ", ".join(s.get("descr", s.get("id")) for s in ready_steps[:3])
        if len(ready_steps) > 3:
            names += ", ..."
        return f"I found {len(ready_steps)} steps ready to start: {names}. Please specify which one."

    # Start the step
    step_id = target["id"]
    await engine.start_step(step_id)
    
    recipe_step = engine.recipe.steps.get(step_id)

    timer_started = False
    # Auto-start UI timer if backend step has duration, auto_start is enabled, and timer isn't already running
    if (
        recipe_step
        and recipe_step.type == "timer"
        and recipe_step.duration
        and recipe_step.auto_start
    ):
        timer_state = session_service.get_kitchen_timer_state(session_id)
        step_seconds = parse_iso_duration(recipe_step.duration)

        if not timer_state.get("running"):
            await start_kitchen_timer(step_seconds)
            timer_started = True
        elif step_seconds and timer_state.get("seconds"):
            current_secs = timer_state.get("seconds")
            if abs(current_secs - step_seconds) > 5:
                await reset_kitchen_timer(step_seconds)
                await start_kitchen_timer(step_seconds)
                timer_started = True

    # Build confirmation message
    return _build_start_confirmation(target, recipe_step, timer_started)


def _find_step_to_start(
    step_id: str,
    step_description: str,
    ready_steps: list
) -> Optional[Dict[str, Any]]:
    """Find the step to start based on ID or description."""
    # Try exact step_id match
    if step_id:
        for s in ready_steps:
            if s["id"] == step_id:
                return s
    
    # Try description match
    if step_description:
        desc_norm = step_description.lower()
        
        # Exact substring match
        for s in ready_steps:
            descr = s.get("descr", "").lower()
            if descr in desc_norm or desc_norm in descr:
                return s
        
        # Keyword match
        tokens = [t for t in re.split(r"[^a-zA-Z0-9]+", desc_norm) if t]
        for s in ready_steps:
            sdesc = s.get("descr", "").lower()
            if any(t in sdesc for t in tokens):
                return s
    
    # If only one ready step, choose it
    if len(ready_steps) == 1:
        return ready_steps[0]
    
    return None


def _build_start_confirmation(target: dict, recipe_step, timer_started: bool) -> str:
    """Build the confirmation message for starting a step."""
    is_timer = target.get("type") == "timer"
    
    if is_timer and recipe_step and recipe_step.duration:
        duration_secs = parse_iso_duration(recipe_step.duration)
        mins = duration_secs // 60
        secs = duration_secs % 60
        
        if mins > 0 and secs > 0:
            duration_str = f"{mins}m {secs}s"
        elif mins > 0:
            duration_str = f"{mins} minute{'s' if mins != 1 else ''}"
        else:
            duration_str = f"{secs} second{'s' if secs != 1 else ''}"
        
        if timer_started:
            return f"✓ Timer running for {duration_str}. I'll let you know when it's done."
        return (
            f"✓ Got it. This step takes about {duration_str}. "
            "Tell me when to start the timer and I'll keep track for you."
        )
    elif is_timer:
        return "✓ Started with timer instructions noted. Let me know when you want the timer to begin."
    else:
        return "✓ Started! Let me know when you're done with this step."
