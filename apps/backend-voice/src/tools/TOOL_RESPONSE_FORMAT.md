# Tool Response Format Standards

## Overview

All recipe tools should return responses that are **state-aware** and **actionable**.
This helps the LLM agent recover from incorrect state transitions and make better decisions.

## Response Format

Every tool response follows this pattern:

```
[STATUS] Brief message
Current: <current_state_context>
Action: <suggested_next_action>
```

## Status Codes

| Status | Meaning | When to Use |
|--------|---------|-------------|
| `[DONE]` | Action completed successfully | Step confirmed, recipe finished |
| `[STARTED]` | Step started successfully | Step activated (timer NOT started) |
| `[TIMER RUNNING]` | Timer started explicitly | start_timer_for_step() called |
| `[TIMER_ACTIVE]` | Timer still running | confirm_step_done() with active timer |
| `[BLOCKED]` | Action cannot proceed | Preconditions not met |
| `[WAIT]` | Action needs prerequisite | Step not ready/started yet |
| `[INFO]` | Informational response | State query, no action taken |
| `[ERROR]` | Unexpected error | System/data error |

## Timer Decoupling (v2.0)

**IMPORTANT**: Timers are decoupled from step lifecycle.

- `start_step()` - Activates the step, timer NOT started
- `start_timer_for_step()` - Explicitly starts the timer for an active step
- `confirm_step_done()` - If timer is running, returns `[TIMER_ACTIVE]` requiring confirmation

### Timer Flow for Timer Steps

```
start_step('roast_squash')
→ [STARTED] Step active, timer NOT started
→ Ask user: "Ready for the timer?"
→ User confirms

start_timer_for_step('roast_squash')
→ [TIMER RUNNING] 50 minute timer started
→ User can navigate to other steps

[Timer notification arrives]
→ Ask user to check

confirm_step_done('roast_squash')
→ [DONE] Step complete, timer cleaned up
```

### Parallel Cooking Support

Multiple timers can run simultaneously. Use `get_active_timers()` to check what's running.

### Confirming with Active Timer

```python
# Timer still running
result = confirm_step_done('roast_squash')
# Returns: [TIMER_ACTIVE] Timer has 25 minutes remaining.
#          Ask user if they want to cancel and complete early.

# User confirms cancellation
result = confirm_step_done('roast_squash', force_cancel_timer=True)
# Returns: [DONE] Step complete, timer cancelled.
```

## State Context

Every response should include relevant state context:

```python
# Good - includes state context
return f"""[BLOCKED] Cannot start '{next_step}'.
Current: '{active_step}' is ACTIVE and not yet complete.
Action: Call confirm_step_done('{active_step}') first."""

# Bad - no context
return "No steps are ready to start right now."
```

## Examples

### start_step() Responses

**Success:**
```
[STARTED] Step in progress.
Current: 'chop_onions' is now ACTIVE.
Action: Wait for user to say they're done, then call confirm_step_done('chop_onions').
```

**Blocked by active step:**
```
[BLOCKED] Cannot start new step.
Current: 'preheat_oven' is ACTIVE (user working on it).
Action: Call confirm_step_done('preheat_oven') when user says done.
```

### confirm_step_done() Responses

**Success with next step:**
```
[DONE] Step complete.
Next: 'roast_squash' is a TIMER step (50 minutes).
Action: Explain what to do, ask if ready, then call start_step('roast_squash').
```

**Step not started:**
```
[WAIT] Cannot confirm step that hasn't started.
Current: 'prep_veg' is READY but not ACTIVE.
Action: Call start_step('prep_veg') to begin this step first.
```

## Implementation Helpers

Use `_build_state_context()` to generate consistent state context:

```python
def _build_state_context(engine: RecipeEngine) -> dict:
    """Get current state context for response building."""
    state = engine.get_state()
    active_steps = [s for s in state["steps"].values() if s["status"] == "active"]
    ready_steps = [s for s in state["steps"].values() if s["status"] == "ready"]
    return {
        "active": active_steps,
        "ready": ready_steps,
        "completed_count": len(state.get("completed_steps", [])),
        "total_count": len(state.get("steps", {})),
    }
```

## Benefits

1. **Agent Recovery**: Agent can self-correct when it makes invalid calls
2. **Debugging**: Logs show exactly what state caused an issue
3. **Consistency**: All tools follow the same pattern
4. **User Experience**: Faster, more natural conversations
