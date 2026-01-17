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

from src.recipe_engine import Recipe, RecipeEngine, RecipeStep, parse_iso_duration, StepStatus, ActiveTimer
from src.services.session_service import session_service
from src.services.recipe_service import get_recipe_service
from src.observability.tracing import trace_tool_call, add_span_attribute
from src.exceptions import (
    SessionNotFoundError,
    RecipeNotLoadedError,
    StepNotFoundError,
    StepNotReadyError,
    StepBlockedError,
    TimerActiveError,
    TimerNotFoundError,
)

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


# =============================================================================
# STATE-AWARE RESPONSE HELPERS
# See TOOL_RESPONSE_FORMAT.md for standards
# =============================================================================

def _build_state_context(engine: RecipeEngine) -> dict:
    """
    Get current state context for building state-aware responses.
    
    Returns:
        Dictionary with active steps, ready steps, and completion counts.
    """
    state = engine.get_state()
    steps = state.get("steps", {})
    
    active_steps = [
        {"id": s.get("id"), "descr": s.get("descr"), "type": s.get("type")}
        for s in steps.values() if s.get("status") == "active"
    ]
    ready_steps = [
        {"id": s.get("id"), "descr": s.get("descr"), "type": s.get("type")}
        for s in steps.values() if s.get("status") == "ready"
    ]
    waiting_steps = [
        {"id": s.get("id"), "descr": s.get("descr"), "type": s.get("type")}
        for s in steps.values() if s.get("status") == "waiting_ack"
    ]
    
    return {
        "active": active_steps,
        "ready": ready_steps,
        "waiting": waiting_steps,
        "completed_count": len(state.get("completed_steps", [])),
        "total_count": len(steps),
    }


def _format_step_brief(step: dict) -> str:
    """Format a step for display in responses."""
    step_type = step.get("type", "immediate")
    descr = step.get("descr", step.get("id", "unknown"))
    type_tag = f" ({step_type})" if step_type == "timer" else ""
    return f"'{descr}'{type_tag}"


def _build_blocked_response(
    action: str,
    reason: str,
    context: dict,
    suggested_action: str
) -> str:
    """
    Build a state-aware blocked response.
    
    Args:
        action: What the agent tried to do
        reason: Why it's blocked
        context: State context from _build_state_context()
        suggested_action: What the agent should do instead
        
    Returns:
        Formatted blocked response with state context
    """
    # Build current state summary
    current_parts = []
    
    if context["active"]:
        active_str = ", ".join(_format_step_brief(s) for s in context["active"][:2])
        current_parts.append(f"ACTIVE: {active_str}")
    
    if context["waiting"]:
        waiting_str = ", ".join(_format_step_brief(s) for s in context["waiting"][:2])
        current_parts.append(f"WAITING_ACK: {waiting_str}")
    
    if context["ready"]:
        ready_count = len(context["ready"])
        if ready_count <= 2:
            ready_str = ", ".join(_format_step_brief(s) for s in context["ready"])
        else:
            ready_str = f"{ready_count} steps"
        current_parts.append(f"READY: {ready_str}")
    
    current_summary = " | ".join(current_parts) if current_parts else "No active steps"
    
    return f"""[BLOCKED] {reason}
Current: {current_summary}
Action: {suggested_action}"""


@register_function(recipe_function_manager)
@trace_tool_call("start_recipe")
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

    # Try to get recipe payload from multiple sources
    payload = recipe_payload or session_service.get_session_recipe_payload(session_id)
    
    # If no payload from frontend, try fetching from Supabase
    if not payload:
        logger.info(f"No frontend payload, fetching recipe '{target_recipe_id}' from Supabase")
        recipe_service = get_recipe_service()
        payload = await recipe_service.get_recipe(target_recipe_id)
        if payload:
            logger.info(f"Successfully fetched recipe from Supabase")
            session_service.set_session_recipe_payload(session_id, payload)
    
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
        
        # Build rich recipe context for the agent
        recipe_context = _build_recipe_context(payload, recipe)
        steps_summary = _build_steps_summary(recipe)
        
        return f"""Recipe loaded: {recipe.title}

{recipe_context}

INTERNAL STEP REFERENCE (use step_id in tools, NEVER show to user):
{chr(10).join(steps_summary)}

You now know this recipe completely. Answer any questions naturally. Guide them through cooking with warmth and encouragement!"""
        
    except Exception as e:
        logger.error(f"Error starting recipe: {e}", exc_info=True)
        return f"Sorry, there was an error starting the recipe: {str(e)}"


def _build_recipe_context(payload: dict, recipe: Recipe) -> str:
    """
    Build a rich context summary of the recipe for the agent.
    
    This gives the agent "knowledge" of the recipe so it can answer
    questions naturally without needing to call tools for basic info.
    """
    recipe_data = payload.get("recipe", {})
    
    # Basic info
    title = recipe_data.get("title", recipe.title)
    servings = recipe_data.get("servings", "Unknown")
    difficulty = recipe_data.get("difficulty", "medium")
    description = recipe_data.get("description", "")
    
    # Timing
    total_time = recipe_data.get("estimated_total", "")
    prep_time = recipe_data.get("prep_time", "")
    cook_time = recipe_data.get("cook_time", "")
    
    time_info = []
    if total_time:
        time_info.append(f"Total: {_format_duration(parse_iso_duration(total_time))}")
    if prep_time:
        time_info.append(f"Prep: {_format_duration(parse_iso_duration(prep_time))}")
    if cook_time:
        time_info.append(f"Cook: {_format_duration(parse_iso_duration(cook_time))}")
    
    # Ingredients summary
    ingredients = payload.get("ingredients", [])
    ing_lines = []
    for ing in ingredients[:15]:  # Limit to first 15 for context window
        if isinstance(ing, dict):
            name = ing.get("name", "")
            qty = ing.get("quantity", "")
            unit = ing.get("unit", "")
            if qty and unit:
                ing_lines.append(f"- {qty} {unit} {name}")
            elif qty:
                ing_lines.append(f"- {qty} {name}")
            else:
                ing_lines.append(f"- {name}")
        elif isinstance(ing, str):
            ing_lines.append(f"- {ing}")
    
    if len(ingredients) > 15:
        ing_lines.append(f"... and {len(ingredients) - 15} more ingredients")
    
    # Steps summary (brief)
    steps = payload.get("steps", [])
    step_lines = []
    for i, step in enumerate(steps[:10], 1):  # Limit for context
        descr = step.get("descr", f"Step {i}")
        step_type = step.get("type", "immediate")
        duration = step.get("duration", "")
        
        if step_type == "timer" and duration:
            dur_str = _format_duration(parse_iso_duration(duration))
            step_lines.append(f"{i}. {descr} ({dur_str})")
        else:
            step_lines.append(f"{i}. {descr}")
    
    if len(steps) > 10:
        step_lines.append(f"... and {len(steps) - 10} more steps")
    
    # Notes/tips
    notes = payload.get("notes", {})
    notes_text = ""
    if isinstance(notes, dict):
        if notes.get("text"):
            notes_text = notes["text"][:200]  # Truncate
        elif notes.get("tips"):
            notes_text = notes["tips"][:200]
    elif isinstance(notes, str):
        notes_text = notes[:200]
    
    # Build context
    context_parts = [
        f"## RECIPE: {title}",
        f"Servings: {servings} | Difficulty: {difficulty}",
    ]
    
    if time_info:
        context_parts.append(f"Time: {' | '.join(time_info)}")
    
    if description:
        context_parts.append(f"\n{description[:300]}")
    
    context_parts.append("\n### INGREDIENTS:")
    context_parts.extend(ing_lines)
    
    context_parts.append("\n### STEPS OVERVIEW:")
    context_parts.extend(step_lines)
    
    if notes_text:
        context_parts.append(f"\n### TIPS: {notes_text}")
    
    return "\n".join(context_parts)
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
    return "Okay, I stopped the current cooking session. Head back to the recipe gallery in the app to choose your next dish!"


@register_function(recipe_function_manager)
async def start_kitchen_timer(duration_seconds: int = 0) -> str:
    """
    Start or resume the global kitchen timer in the UI.

    Args:
        duration_seconds: Optional duration in seconds. If omitted, the existing timer value is used.
    """
    session_id = _get_session_id()
    logger.info(f"🕐 [TIMER] start_kitchen_timer called with duration_seconds={duration_seconds}, session={session_id}")
    if not session_id:
        return "I couldn't determine your session. Please reconnect and try again."

    seconds = max(0, int(duration_seconds))
    try:
        logger.info(f"🕐 [TIMER] Sending timer_start control event with seconds={seconds}")
        await session_service.send_control_event(
            session_id,
            "timer_start",
            {"seconds": seconds} if seconds else None,
        )
        logger.info(f"🕐 [TIMER] Control event sent successfully")
        session_service.set_kitchen_timer_state(
            session_id, running=True, seconds=seconds if seconds else None
        )
        if seconds:
            return f"Starting a timer for {_format_duration(seconds)}."
        return "Starting the kitchen timer now."
    except Exception as exc:
        logger.error(f"🕐 [TIMER] Failed to start kitchen timer: {exc}", exc_info=True)
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


# =============================================================================
# ENHANCED TIMER TOOLS - Natural timer management for parallel cooking
# =============================================================================

@register_function(recipe_function_manager)
@trace_tool_call("start_custom_timer")
async def start_custom_timer(label: str, minutes: int = 0, seconds: int = 0) -> str:
    """
    Start a custom timer with a label. Use this when the user wants to set
    a timer that's not tied to a specific recipe step.
    
    Examples:
    - "Set a timer for 5 minutes for the pasta"
    - "Remind me in 3 minutes to check the sauce"
    - "Start a 10 minute timer"
    
    Args:
        label: A descriptive name for the timer (e.g., "pasta", "sauce", "bread")
        minutes: Number of minutes
        seconds: Number of seconds (in addition to minutes)
        
    Returns:
        Confirmation that the timer was started
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No session found. Please reconnect."
    
    engine = _get_engine(session_id)
    if not engine:
        return "[ERROR] No recipe is in progress. Start a recipe first."
    
    total_seconds = (minutes * 60) + seconds
    if total_seconds <= 0:
        return "[ERROR] Please specify a positive duration for the timer."
    
    # Create a custom timer through the timer manager
    timer_id = f"custom-{label.lower().replace(' ', '-')}-{int(total_seconds)}"
    
    try:
        # For custom timers, we send a control event to the frontend
        await session_service.send_control_event(
            session_id,
            "timer_start",
            {
                "seconds": total_seconds,
                "label": label,
                "timer_id": timer_id,
                "is_custom": True
            }
        )
        
        duration_str = _format_duration(total_seconds)
        return f"[TIMER STARTED] {duration_str} timer set for '{label}'.\nI'll let you know when it's done!"
    
    except Exception as e:
        logger.error(f"Failed to start custom timer: {e}")
        return f"[ERROR] Sorry, I couldn't start that timer. {str(e)}"


@register_function(recipe_function_manager)
@trace_tool_call("adjust_timer")
async def adjust_timer(
    step_id: str = "",
    label: str = "",
    add_minutes: int = 0,
    subtract_minutes: int = 0
) -> str:
    """
    Adjust the time on a running timer by adding or subtracting minutes.
    
    Use this when the user says:
    - "Add 5 minutes to the squash timer"
    - "Take 2 minutes off the timer"
    - "Give me 3 more minutes"
    
    Args:
        step_id: The step ID if adjusting a step timer
        label: The timer label if adjusting a custom timer
        add_minutes: Minutes to add to the timer
        subtract_minutes: Minutes to subtract from the timer
        
    Returns:
        Confirmation of the adjustment
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No session found. Please reconnect."
    
    engine = _get_engine(session_id)
    if not engine:
        return "[ERROR] No recipe is in progress."
    
    adjustment_secs = (add_minutes * 60) - (subtract_minutes * 60)
    
    if adjustment_secs == 0:
        return "[ERROR] Please specify how much time to add or subtract."
    
    # Find the timer to adjust
    active_timers = engine.get_active_timers()
    target_timer = None
    
    if step_id:
        for t in active_timers:
            if t.step_id == step_id:
                target_timer = t
                break
    elif label:
        label_lower = label.lower()
        for t in active_timers:
            if label_lower in t.label.lower():
                target_timer = t
                break
    elif len(active_timers) == 1:
        # If only one timer, use that
        target_timer = active_timers[0]
    
    if not target_timer:
        if not active_timers:
            return "[INFO] No timers are currently running."
        timers_list = ", ".join([f"'{t.label}'" for t in active_timers])
        return f"[INFO] Multiple timers running: {timers_list}. Please specify which one to adjust."
    
    # Calculate new time
    current_remaining = target_timer.remaining_secs or 0
    new_remaining = max(0, current_remaining + adjustment_secs)
    
    # Send adjustment to frontend
    try:
        await session_service.send_control_event(
            session_id,
            "timer_adjust",
            {
                "timer_id": target_timer.id,
                "step_id": target_timer.step_id,
                "new_seconds": new_remaining,
                "adjustment": adjustment_secs
            }
        )
        
        if adjustment_secs > 0:
            action = f"Added {_format_duration(abs(adjustment_secs))}"
        else:
            action = f"Removed {_format_duration(abs(adjustment_secs))}"
        
        new_remaining_str = _format_duration(new_remaining)
        return f"[TIMER ADJUSTED] {action} to '{target_timer.label}'. Now {new_remaining_str} remaining."
    
    except Exception as e:
        logger.error(f"Failed to adjust timer: {e}")
        return f"[ERROR] Sorry, I couldn't adjust that timer."


@register_function(recipe_function_manager)
@trace_tool_call("cancel_timer")
async def cancel_timer(step_id: str = "", label: str = "") -> str:
    """
    Cancel a running timer without completing the step.
    
    Use this when the user wants to stop a timer:
    - "Cancel the squash timer"
    - "Stop the timer"
    - "Never mind about that timer"
    
    Args:
        step_id: The step ID if cancelling a step timer
        label: The timer label if cancelling a custom timer
        
    Returns:
        Confirmation that the timer was cancelled
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No session found. Please reconnect."
    
    engine = _get_engine(session_id)
    if not engine:
        return "[ERROR] No recipe is in progress."
    
    active_timers = engine.get_active_timers()
    target_timer = None
    
    if step_id:
        for t in active_timers:
            if t.step_id == step_id:
                target_timer = t
                break
    elif label:
        label_lower = label.lower()
        for t in active_timers:
            if label_lower in t.label.lower():
                target_timer = t
                break
    elif len(active_timers) == 1:
        target_timer = active_timers[0]
    
    if not target_timer:
        if not active_timers:
            return "[INFO] No timers are currently running."
        timers_list = ", ".join([f"'{t.label}'" for t in active_timers])
        return f"[INFO] Multiple timers running: {timers_list}. Please specify which one to cancel."
    
    # Cancel the timer
    try:
        if target_timer.step_id:
            await engine.cancel_timer_for_step(target_timer.step_id)
        
        await session_service.send_control_event(
            session_id,
            "timer_cancel",
            {
                "timer_id": target_timer.id,
                "step_id": target_timer.step_id,
            }
        )
        
        return f"[TIMER CANCELLED] Stopped the '{target_timer.label}' timer."
    
    except Exception as e:
        logger.error(f"Failed to cancel timer: {e}")
        return f"[ERROR] Sorry, I couldn't cancel that timer."


@register_function(recipe_function_manager)
@trace_tool_call("list_timers")
async def list_timers() -> str:
    """
    List all currently running timers with their remaining times.
    
    Use this when the user asks:
    - "What timers do I have?"
    - "How much time left?"
    - "What's cooking?"
    
    Returns:
        List of all active timers with remaining times, or confirmation if none
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No session found. Please reconnect."
    
    engine = _get_engine(session_id)
    if not engine:
        return "[INFO] No recipe is in progress, so no timers running."
    
    active_timers = engine.get_active_timers()
    
    if not active_timers:
        return "[INFO] No timers currently running. All clear!"
    
    lines = [f"You have {len(active_timers)} timer{'s' if len(active_timers) > 1 else ''} running:"]
    
    for timer in active_timers:
        remaining_str = _format_duration(timer.remaining_secs or 0)
        timer_type = "Step timer" if timer.step_id else "Custom timer"
        lines.append(f"  • {timer.label}: {remaining_str} left ({timer_type})")
    
    return "\n".join(lines)


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
@trace_tool_call("confirm_step_done")
async def confirm_step_done(
    step_id: str = "",
    step_description: str = "",
    force_cancel_timer: bool = False
) -> str:
    """
    Confirm that a cooking step is complete. Use this when the user indicates 
    they've finished a step (e.g., "done", "finished", "ready", "next").
    
    ALWAYS provide step_id for precision (e.g., "preheat_oven", "roast_squash").
    
    If a timer is still running for this step:
    - Without force_cancel_timer: Returns [TIMER_ACTIVE] asking you to confirm with user
    - With force_cancel_timer=True: Cancels the timer and completes the step
    
    Args:
        step_id: The ID of the step to confirm (PREFERRED - use this!)
        step_description: Fallback description if step_id not known
        force_cancel_timer: If True, cancel any active timer and complete step
        
    Returns:
        State-aware confirmation and what happens next
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No session found. Please reconnect."

    engine = _get_engine(session_id)
    
    if not engine:
        return "[ERROR] No recipe in progress. Call start_recipe() first."
    
    # Get state context for state-aware responses
    context = _build_state_context(engine)
    state = engine.get_state()
    active_steps = engine.get_active_steps()
    
    # First, try to find the step to confirm by ID or description
    step_to_confirm = None
    
    # Check if a specific step_id was provided and find it
    if step_id:
        step_info = state["steps"].get(step_id)
        if step_info:
            step_status = step_info["status"]
            step_type = step_info.get("type", "immediate")
            step_descr = step_info.get("descr", step_id)
            
            # STATE-AWARE: If the step is READY, explain why we can't confirm
            if step_status == "ready":
                logger.info(f"Step '{step_id}' is READY but not started - agent should call start_step() first")
                return _build_blocked_response(
                    action=f"confirm '{step_descr}'",
                    reason=f"Step '{step_descr}' is READY but not started yet.",
                    context=context,
                    suggested_action=f"Call start_step('{step_id}') to begin this step first."
                )
            
            # STATE-AWARE: If step is already completed
            if step_status == "completed":
                logger.info(f"Step '{step_id}' is already completed")
                return f"[INFO] '{step_descr}' is already complete. Check get_current_step() for next action."
            
            # If step is ACTIVE or WAITING_ACK, we can confirm it
            for step in engine.get_active_steps():
                if step.id == step_id:
                    step_to_confirm = step
                    break
    
    # If no specific step found yet, check active steps
    if not step_to_confirm:
        active_steps = engine.get_active_steps()
        
        if active_steps:
            step_to_confirm = _find_step_to_confirm(
                step_id, step_description, active_steps, state
            )
            if not step_to_confirm:
                # Default to first active step
                step_to_confirm = active_steps[0]
    
    # If still no step to confirm, check for ready steps
    if not step_to_confirm:
        ready_steps = [s for s in state["steps"].values() if s["status"] == "ready"]
        
        if ready_steps:
            # Find the best match among ready steps
            target = None
            if step_id:
                for s in ready_steps:
                    if s["id"] == step_id:
                        target = s
                        break
            if not target and step_description:
                desc_norm = step_description.lower()
                for s in ready_steps:
                    if desc_norm in s.get("descr", "").lower():
                        target = s
                        break
            if not target:
                target = ready_steps[0]
            
            # STATE-AWARE: DON'T auto-complete ready steps! Explain the issue.
            step_descr = target.get("descr", target["id"])
            return _build_blocked_response(
                action=f"confirm '{step_descr}'",
                reason=f"'{step_descr}' is READY but hasn't been started.",
                context=context,
                suggested_action=f"Call start_step('{target['id']}') to begin this step."
            )
        else:
            # Check if recipe is complete
            completed = context["completed_count"]
            total = context["total_count"]
            if completed == total and total > 0:
                return "[DONE] All steps completed - recipe finished! 🎉"
            
            # No ready steps but recipe not complete - unusual state
            return f"[INFO] No steps to confirm. Progress: {completed}/{total} steps complete."
    
    # Confirm the step
    if step_to_confirm:
        logger.info(f"Confirming step: {step_to_confirm.id} (force_cancel_timer={force_cancel_timer})")
        
        # Check if there's an active timer - engine will tell us
        result = await engine.confirm_step_done(step_to_confirm.id, force_cancel_timer=force_cancel_timer)
        
        # Handle timer cancellation confirmation flow
        if result.get("status") == "timer_active":
            remaining = result.get("remaining_secs", 0)
            remaining_str = _format_duration(remaining)
            step_descr = step_to_confirm.descr
            
            return (
                f"[TIMER_ACTIVE] '{step_descr}' has a timer with {remaining_str} remaining.\n"
                f"Ask user: 'The timer still has {remaining_str}. Cancel it and mark as done?'\n"
                f"If YES → call confirm_step_done('{step_to_confirm.id}', force_cancel_timer=True)\n"
                f"If NO → continue waiting for the timer."
            )
    
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
    """
    Build the confirmation response with progress context.
    
    See TOOL_RESPONSE_FORMAT.md for response standards.
    """
    completed = len(state.get("completed_steps", []))
    total = len(state.get("steps", {}))
    progress = f"({completed}/{total} done)"
    
    if ready_steps:
        if len(ready_steps) == 1:
            next_step = ready_steps[0]
            step_type = next_step.get("type", "immediate")
            step_id = next_step['id']
            step_descr = next_step['descr']
            
            if step_type == "timer":
                return (
                    f"[DONE] Step complete {progress}.\n"
                    f"Next: '{step_descr}' (TIMER step).\n"
                    f"⚠️ STOP: Do NOT call start_step yet! Ask user 'Ready for the timer?' first.\n"
                    f"Action: Describe step → Ask user → WAIT for confirmation → Then call start_step('{step_id}')."
                )
            else:
                return (
                    f"[DONE] Step complete {progress}.\n"
                    f"Next: '{step_descr}'.\n"
                    f"Action: Call start_step('{step_id}') to begin."
                )
        else:
            options = [
                f"'{s['descr']}' (id: {s['id']}, {s.get('type', 'immediate')})" 
                for s in ready_steps[:3]
            ]
            return (
                f"[DONE] Step complete {progress}.\n"
                f"Next: {len(ready_steps)} steps ready - user can choose:\n"
                f"  {' | '.join(options)}"
            )
    else:
        # Check if everything is done
        if completed == total and total > 0:
            return f"[DONE] All {total} steps completed - recipe finished! 🎉"
        else:
            return f"[DONE] Step complete {progress}. Waiting for parallel steps/timers."


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
@trace_tool_call("start_step")
async def start_step(step_id: str = "", step_description: str = "") -> str:
    """
    Explicitly start a READY step. Use when the user says they started a step
    (e.g., "the squash is in the oven"). If no step_id is provided, we try to
    match by description among READY steps.
    
    Args:
        step_id: Optional explicit step id to start
        step_description: Optional natural language hint to choose the step
        
    Returns:
        A short confirmation of the step started, or state-aware guidance if blocked.
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No session found. Please reconnect."

    engine = _get_engine(session_id)
    if not engine:
        return "[ERROR] No recipe is in progress. Call start_recipe() first."

    # Get state context for state-aware responses
    context = _build_state_context(engine)
    state = engine.get_state()
    steps: Dict[str, Any] = state.get("steps", {})

    # Collect READY steps
    ready_steps = [s for s in steps.values() if s.get("status") == "ready"]
    
    # STATE-AWARE: No ready steps - explain why and suggest action
    if not ready_steps:
        # Check if there are active steps blocking
        if context["active"]:
            active_step = context["active"][0]
            return _build_blocked_response(
                action="start new step",
                reason=f"Cannot start new step while '{active_step['descr']}' is in progress.",
                context=context,
                suggested_action=f"Call confirm_step_done('{active_step['id']}') when user says done."
            )
        elif context["waiting"]:
            waiting_step = context["waiting"][0]
            return _build_blocked_response(
                action="start new step",
                reason=f"Step '{waiting_step['descr']}' is waiting for confirmation.",
                context=context,
                suggested_action=f"Call confirm_step_done('{waiting_step['id']}') to confirm timer completion."
            )
        else:
            # All steps completed or recipe not started
            completed = context["completed_count"]
            total = context["total_count"]
            if completed == total and total > 0:
                return "[INFO] All steps completed! Recipe is finished."
            return "[INFO] No steps are ready. Recipe may not have started properly."

    # Find the target step
    target = _find_step_to_start(step_id, step_description, ready_steps)
    
    if not target:
        names = ", ".join(f"'{s.get('descr')}' (id: {s.get('id')})" for s in ready_steps[:3])
        if len(ready_steps) > 3:
            names += ", ..."
        return f"[INFO] {len(ready_steps)} steps ready: {names}. Specify which one with start_step(step_id='...')."

    # Start the step
    target_step_id = target["id"]
    await engine.start_step(target_step_id)
    
    recipe_step = engine.recipe.steps.get(target_step_id)

    # NOTE: We do NOT auto-start the UI timer here anymore.
    # The agent should ask the user "Ready for me to start the timer?" first,
    # and only call start_kitchen_timer() when the user confirms.
    # This creates a more natural, conversational flow.

    # Build confirmation message (includes timer duration info for agent to use)
    return _build_start_confirmation(target, recipe_step)


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


def _build_start_confirmation(target: dict, recipe_step) -> str:
    """
    Build the confirmation message for starting a step.
    
    TIMER DECOUPLING: Starting a step does NOT auto-start its timer.
    The agent should call start_timer_for_step() when the user is ready.
    
    See TOOL_RESPONSE_FORMAT.md for response standards.
    """
    step_id = target.get("id", "unknown")
    step_descr = target.get("descr", step_id)
    is_timer = target.get("type") == "timer"
    
    if is_timer and recipe_step and recipe_step.duration:
        duration_secs = parse_iso_duration(recipe_step.duration)
        duration_str = _format_duration(duration_secs)
        
        # Timer step started but timer NOT running yet - agent must start it explicitly
        return (
            f"[STARTED] '{step_descr}' is now active ({duration_str} timer available).\n"
            f"Current: Step '{step_id}' is ACTIVE. Timer NOT started yet.\n"
            f"Action: Guide user through this step, then ASK 'Ready for the timer?' "
            f"When they confirm, call start_timer_for_step('{step_id}')."
        )
    elif is_timer:
        return (
            f"[STARTED] '{step_descr}' is now active (timer step).\n"
            f"Current: Step '{step_id}' is ACTIVE. Timer NOT started yet.\n"
            f"Action: Ask user if ready for timer, then call start_timer_for_step('{step_id}')."
        )
    else:
        return (
            f"[STARTED] '{step_descr}' is now in progress.\n"
            f"Current: Step '{step_id}' is ACTIVE.\n"
            f"Action: Guide user, then call confirm_step_done('{step_id}') when THEY say done."
        )


@register_function(recipe_function_manager)
@trace_tool_call("start_timer_for_step")
async def start_timer_for_step(step_id: str) -> str:
    """
    Start the timer for a cooking step. Use this when the user confirms they
    are ready to start the timer (e.g., "yes", "start the timer", "go ahead").
    
    This is SEPARATE from start_step() - the step must already be ACTIVE.
    
    The flow for timer steps is:
    1. start_step(step_id) - activates the step (timer NOT started)
    2. Guide user through prep for this step
    3. Ask "Ready for the timer?"
    4. User confirms → start_timer_for_step(step_id) - NOW timer starts
    5. Timer runs (user can work on other steps meanwhile)
    6. Timer done → ask user to check → confirm_step_done(step_id)
    
    Args:
        step_id: The ID of the step to start the timer for
        
    Returns:
        Confirmation that timer started with duration info
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No session found. Please reconnect."

    engine = _get_engine(session_id)
    if not engine:
        return "[ERROR] No recipe is in progress. Call start_recipe() first."
    
    # Try to start the timer
    timer = await engine.start_timer_for_step(step_id)
    
    if not timer:
        # Check why it failed
        state = engine.get_state()
        step_info = state["steps"].get(step_id)
        
        if not step_info:
            return f"[ERROR] Step '{step_id}' not found."
        
        step_status = step_info.get("status")
        step_type = step_info.get("type")
        
        if step_type != "timer":
            return f"[ERROR] Step '{step_id}' is not a timer step."
        
        if step_status != "active":
            return (
                f"[BLOCKED] Cannot start timer - step '{step_id}' is not active (status: {step_status}).\n"
                f"Action: Call start_step('{step_id}') first to activate the step."
            )
        
        # Timer might already be running
        if engine.has_active_timer_for_step(step_id):
            existing_timer = engine._timer_manager.get_timer_for_step(step_id)
            if existing_timer:
                remaining_str = _format_duration(existing_timer.remaining_secs or 0)
                return f"[INFO] Timer already running for '{step_id}' with {remaining_str} remaining."
        
        return f"[ERROR] Could not start timer for step '{step_id}'."
    
    # Timer started successfully
    duration_str = _format_duration(timer.duration_secs)
    
    # Also send control event to frontend to start UI timer
    await _send_control_event(session_id, "timer_start", {"seconds": timer.duration_secs})
    
    return (
        f"[TIMER RUNNING] {duration_str} timer started for '{timer.label}'.\n"
        f"Timer ID: {timer.id}\n"
        f"Action: User can continue with other steps. When timer completes, ask user to check, "
        f"then call confirm_step_done('{step_id}')."
    )


@register_function(recipe_function_manager)
async def get_active_timers() -> str:
    """
    Get all currently running timers. Use this to check what timers are active
    when the user asks about timers or when you need to track parallel cooking.
    
    Returns:
        List of active timers with remaining times
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No session found. Please reconnect."

    engine = _get_engine(session_id)
    if not engine:
        return "[ERROR] No recipe is in progress."
    
    timers = engine.get_active_timers()
    
    if not timers:
        return "[INFO] No active timers running."
    
    timer_list = []
    for t in timers:
        remaining_str = _format_duration(t.remaining_secs or 0)
        step_info = f" (Step: {t.step_id})" if t.step_id else " (Custom timer)"
        timer_list.append(f"- {t.label}: {remaining_str} remaining{step_info}")
    
    return f"[INFO] Active timers ({len(timers)}):\n" + "\n".join(timer_list)


async def _send_control_event(session_id: str, action: str, data: dict) -> None:
    """Send a control event to the frontend."""
    try:
        await session_service.send_control_event(session_id, action, data)
    except Exception as e:
        logger.warning(f"Failed to send control event: {e}")


# =============================================================================
# NAVIGATION TOOLS
# These tools allow the agent to freely navigate the recipe
# =============================================================================

@register_function(recipe_function_manager)
@trace_tool_call("go_to_step")
async def go_to_step(step_id: str = "", step_number: int = 0) -> str:
    """
    Navigate to a specific step in the recipe. Use this when the user wants to
    jump to a different step, go back to a previous step, or skip ahead.
    
    This does NOT change the step's status - it just scrolls the UI to show
    that step. Use start_step() to actually begin working on a step.
    
    Examples:
    - User: "Go back to step 2" → go_to_step(step_number=2)
    - User: "Show me the mixing step" → go_to_step(step_id="mix_ingredients")
    - User: "What was step 3 again?" → go_to_step(step_number=3)
    
    Args:
        step_id: The ID of the step to navigate to (preferred)
        step_number: The step number (1-based) to navigate to
        
    Returns:
        Confirmation of navigation and step details
    """
    session_id = _get_session_id()
    if not session_id:
        return "[ERROR] No session found. Please reconnect."
    
    engine = _get_engine(session_id)
    if not engine:
        return "[ERROR] No recipe in progress. Call start_recipe() first."
    
    state = engine.get_state()
    steps_list = list(engine.recipe.steps.values())
    
    target_step = None
    step_index = 0
    
    # Find by step_id first
    if step_id:
        for idx, step in enumerate(steps_list):
            if step.id == step_id or step_id.lower() in step.id.lower():
                target_step = step
                step_index = idx
                break
    
    # If not found by ID, try by step number (1-based)
    if not target_step and step_number > 0:
        if 1 <= step_number <= len(steps_list):
            target_step = steps_list[step_number - 1]
            step_index = step_number - 1
    
    if not target_step:
        available_steps = [f"{i+1}. {s.descr} (id: {s.id})" for i, s in enumerate(steps_list)]
        return (
            f"[INFO] Step not found. Available steps:\n" +
            "\n".join(available_steps)
        )
    
    # Send focus event to frontend
    await _send_focus_step_event(session_id, target_step.id, step_index)
    
    # Get step status
    step_info = state["steps"].get(target_step.id, {})
    step_status = step_info.get("status", "unknown")
    
    # Check if there's a timer for this step
    timer_info = ""
    active_timers = engine.get_active_timers()
    for timer in active_timers:
        if timer.step_id == target_step.id:
            remaining = _format_duration(timer.remaining_secs or 0)
            timer_info = f" Timer running: {remaining} remaining."
    
    return (
        f"[NAVIGATED] Now showing step {step_index + 1}: '{target_step.descr}'\n"
        f"Status: {step_status.upper()}{timer_info}\n"
        f"Instructions: {target_step.instructions}"
    )


# =============================================================================
# APP-AGENT SYNC HELPERS
# These functions allow the agent to synchronize UI state with its conversation
# =============================================================================

async def _send_focus_step_event(session_id: str, step_id: str, step_index: int = 0) -> None:
    """Send event to focus/scroll to a specific step in the UI."""
    try:
        await session_service.send_control_event(
            session_id,
            "focus_step",
            {"step_id": step_id, "step_index": step_index}
        )
    except Exception as e:
        logger.warning(f"Failed to send focus_step event: {e}")


async def _send_highlight_ingredient_event(session_id: str, ingredient: str) -> None:
    """Send event to highlight an ingredient in the UI."""
    try:
        await session_service.send_control_event(
            session_id,
            "highlight_ingredient",
            {"ingredient": ingredient}
        )
    except Exception as e:
        logger.warning(f"Failed to send highlight_ingredient event: {e}")
