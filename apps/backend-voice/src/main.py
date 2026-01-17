"""
Jamie Oliver AI Cooking Assistant - Backend Server

A voice-powered cooking assistant that guides users through recipes
with natural conversation and real-time step management.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ccai.core.audio_interface.websocket_audio_interface import WebSocketAudioInterface
from ccai.core.logger import configure_logger
from ccai.core import context_variables

from src.config import settings
from src.services import AssistantFactory, RecipeEventHandler
from src.services.session_service import session_service
from src.services.tool_runner import run_recipe_tool
from src.tools.recipe_tools import (
    start_recipe as start_recipe_tool,
    confirm_step_done as confirm_step_tool,
)
from src.observability.tracing import init_tracing

logger = configure_logger(__name__)

DEFAULT_HELLO_MESSAGE = (
    "Hello! I'm your cooking assistant. Ask me what recipes are available "
    "or tell me what you'd like to cook, and I'll guide you step by step."
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown events."""
    logger.info("🚀 Starting Jamie Oliver AI Backend...")
    
    # Initialize OpenTelemetry tracing (if available)
    tracing_enabled = init_tracing(
        service_name="jamie-voice",
        enabled=settings.OTEL_ENABLED if hasattr(settings, 'OTEL_ENABLED') else True
    )
    if tracing_enabled:
        logger.info("📊 OpenTelemetry tracing enabled")
    
    # Validate configuration
    if not settings.validate():
        logger.warning("⚠️  Some API keys are missing. Check your .env file.")
    
    yield
    
    logger.info("🛑 Shutting down Jamie Oliver AI Backend...")


# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_TITLE,
    description=settings.APP_DESCRIPTION,
    version=settings.APP_VERSION,
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def healthcheck():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "jamie-oliver-ai-backend",
        "version": settings.APP_VERSION
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "service": "jamie-oliver-ai-backend",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT
    }

@app.post("/sessions/{session_id}/steps/{step_id}/confirm")
async def confirm_step_for_session(session_id: str, step_id: str):
    """
    Confirm a recipe step for a given session.
    Allows the frontend to mark a step as done without voice input.
    
    If the step is in READY status, it will be started first then completed.
    """
    from src.tools.recipe_tools import start_step as start_step_tool
    
    engine = session_service.get_engine(session_id)
    if not engine:
        raise HTTPException(status_code=404, detail="Session not found")
    
    step = engine.recipe.steps.get(step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found for current recipe")

    # Check current step status
    state = engine.get_state()
    step_info = state["steps"].get(step_id, {})
    step_status = step_info.get("status", "unknown")
    
    logger.info(f"Manual completion requested for step '{step_id}' with status '{step_status}'")

    try:
        # If step is READY, start it first so we can complete it
        if step_status == "ready":
            logger.info(f"Step '{step_id}' is READY - starting it first before completion")
            await run_recipe_tool(
                session_id,
                start_step_tool,
                step_id=step_id,
            )
        
        # Now complete the step
        tool_message = await run_recipe_tool(
            session_id,
            confirm_step_tool,
            step_id=step_id,
        )
    except Exception as exc:
        logger.error(f"Failed to confirm step {step_id} for {session_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Unable to confirm step: {exc}")

    # Check what happened based on tool response
    step_completed = tool_message.startswith("[DONE]") or "completed" in tool_message.lower()
    timer_active = tool_message.startswith("[TIMER_ACTIVE]")
    
    assistant = session_service.get_assistant(session_id)
    if assistant and step_completed:
        try:
            system_message = (
                f"[SYSTEM: Step '{step.descr}' (step_id: {step_id}) has been marked as complete "
                f"via the frontend. The user has finished this step.]"
            )
            await assistant.inject_system_message(system_message)
            logger.info(f"✅ Injected system message to assistant for step confirmation: {step_id}")
        except Exception as e:
            logger.warning(f"Failed to inject system message to assistant: {e}")
    elif assistant and timer_active:
        # User clicked "Mark Complete" but timer is still running - ask agent to handle
        try:
            system_message = (
                f"[SYSTEM: The user clicked 'Mark Complete' for '{step.descr}' (step_id: {step_id}), "
                f"but a timer is still running. Ask them: 'Want to cancel the timer and mark it done?' "
                f"If they say yes, call confirm_step_done('{step_id}', force_cancel_timer=True)]"
            )
            await assistant.inject_system_message(system_message)
            logger.info(f"⏰ Injected timer confirmation request to assistant for step: {step_id}")
        except Exception as e:
            logger.warning(f"Failed to inject timer confirmation message: {e}")
    elif assistant and not step_completed:
        logger.warning(f"Step '{step_id}' was NOT completed (response: {tool_message}), skipping success message")
    else:
        logger.debug(f"No assistant registered for session {session_id}, skipping system message injection")
    
    state = engine.get_state()
    state["has_recipe"] = True
    return {"state": state, "message": tool_message}


@app.post("/sessions/{session_id}/steps/{step_id}/start-timer")
async def start_timer_for_step_api(session_id: str, step_id: str):
    """
    Start a timer for a specific step.
    Allows the frontend to start timers via UI without voice input.
    
    The step must be in ACTIVE status to start a timer.
    """
    from src.tools.recipe_tools import start_timer_for_step as start_timer_tool
    from src.tools.recipe_tools import start_step as start_step_tool
    
    engine = session_service.get_engine(session_id)
    if not engine:
        raise HTTPException(status_code=404, detail="Session not found")
    
    step = engine.recipe.steps.get(step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found for current recipe")
    
    # Check step status
    state = engine.get_state()
    step_info = state["steps"].get(step_id, {})
    step_status = step_info.get("status", "unknown")
    
    logger.info(f"Timer start requested for step '{step_id}' with status '{step_status}'")
    
    try:
        # If step is READY, start it first
        if step_status == "ready":
            logger.info(f"Step '{step_id}' is READY - starting it first before timer")
            await run_recipe_tool(session_id, start_step_tool, step_id=step_id)
        
        # Now start the timer
        tool_message = await run_recipe_tool(session_id, start_timer_tool, step_id=step_id)
    except Exception as exc:
        logger.error(f"Failed to start timer for step {step_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Unable to start timer: {exc}")
    
    # Notify agent that user started a timer via UI
    assistant = session_service.get_assistant(session_id)
    if assistant:
        try:
            system_message = (
                f"[SYSTEM: The user started the timer for '{step.descr}' (step_id: {step_id}) "
                f"via the app UI. The timer is now running. Continue guiding them naturally.]"
            )
            await assistant.inject_system_message(system_message)
            logger.info(f"⏰ Injected timer start message to assistant for step: {step_id}")
        except Exception as e:
            logger.warning(f"Failed to inject timer start message: {e}")
    
    state = engine.get_state()
    state["has_recipe"] = True
    return {"state": state, "message": tool_message}


@app.post("/sessions/{session_id}/timers/{timer_id}/cancel")
async def cancel_timer_api(session_id: str, timer_id: str):
    """
    Cancel an active timer.
    Allows the frontend to cancel timers via UI.
    """
    engine = session_service.get_engine(session_id)
    if not engine:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get timer info before cancelling for the response
    timer = engine._timer_manager.get_timer_by_id(timer_id)
    if not timer:
        raise HTTPException(status_code=404, detail="Timer not found")
    
    label = timer.label
    step_id = timer.step_id
    
    logger.info(f"Timer cancel requested: '{timer_id}' ({label})")
    
    try:
        result = await engine._timer_manager.cancel_timer(timer_id, emit_event=True)
        if not result:
            raise HTTPException(status_code=400, detail="Failed to cancel timer")
    except Exception as exc:
        logger.error(f"Failed to cancel timer {timer_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Unable to cancel timer: {exc}")
    
    # Notify agent
    assistant = session_service.get_assistant(session_id)
    if assistant:
        try:
            system_message = (
                f"[SYSTEM: The user cancelled the timer '{label}' via the app UI."
                + (f" Step: {step_id}" if step_id else "")
                + " Continue guiding them naturally.]"
            )
            await assistant.inject_system_message(system_message)
            logger.info(f"⏰ Injected timer cancel message to assistant")
        except Exception as e:
            logger.warning(f"Failed to inject timer cancel message: {e}")
    
    state = engine.get_state()
    return {"state": state, "message": f"Timer '{label}' cancelled"}


@app.websocket("/ws/voice")
async def voice_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for voice conversations.
    Handles audio streaming for real-time voice interactions.
    """
    session_id = None
    assistant = None
    assistant_task = None
    
    try:
        # Initialize WebSocket audio interface
        logger.info("Initializing WebSocket audio interface")
        audio_interface = WebSocketAudioInterface(
            websocket=websocket,
            sample_rate=settings.SAMPLE_RATE
        )
        
        # Start the audio interface (accepts WebSocket and does handshake)
        await audio_interface.start()
        
        custom_parameters = audio_interface.custom_parameters or {}
        
        # Get session ID and channels
        session_id = audio_interface._input_service.session_id
        logger.info(f"Voice session started: {session_id}")
        
        # Set session_id in context variables for function access
        context_variables.set("session_id", session_id)
        
        input_channel = audio_interface.get_input_service()
        output_channel = audio_interface.get_output_service()
        session_service.register_output_channel(session_id, output_channel)
        
        # Create voice assistant
        assistant = AssistantFactory.create_voice_assistant(
            input_channel=input_channel,
            output_channel=output_channel,
        )
        
        # Set up recipe event handler
        event_handler = RecipeEventHandler(
            session_id=session_id,
            output_channel=output_channel,
            get_engine_func=session_service.get_engine,
            assistant=assistant
        )
        
        # Register event callback for this session
        session_service.register_event_callback(
            session_id,
            event_handler.handle_event
        )
        logger.info(f"✅ Recipe event handler registered for session: {session_id}")
        
        # Register assistant for this session (so it can be notified of step confirmations)
        session_service.register_assistant(session_id, assistant)
        logger.info(f"✅ Assistant registered for session: {session_id}")
        
        # Send diagnostic message to confirm WebSocket connection
        try:
            await output_channel.send_event(
                "recipe_message",
                {"message": f"Connected to cooking session: {session_id}"}
            )
            logger.info("📡 Sent diagnostic recipe_message to frontend")
        except Exception as e:
            logger.error(f"Failed to send diagnostic event: {e}")
        
        # Prepare recipe context (auto-start when frontend is already in cooking mode)
        initial_greeting, active_recipe_id = await _prepare_initial_context(
            session_id=session_id,
            custom_parameters=custom_parameters,
        )
        
        # Share session metadata with the frontend (needed for UI coordination)
        try:
            await output_channel.send_event(
                "session_info",
                {
                    "session_id": session_id,
                    "recipe_id": active_recipe_id or session_service.get_session_recipe(session_id),
                    "mode": custom_parameters.get("mode"),
                }
            )
            logger.info(f"📡 Sent session_info to frontend for session {session_id}")
        except Exception as exc:
            logger.error(f"Failed to send session_info event: {exc}")
        
        # Start the voice assistant
        logger.info(f"Starting voice assistant for session {session_id}")
        assistant_task = asyncio.create_task(
            assistant.start(
                hello_message=initial_greeting
            )
        )
        
        # Wait for the assistant to finish or for WebSocket to disconnect
        await assistant_task
        logger.info(f"Voice session ended normally: {session_id}")
        
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session: {session_id}")
        await _cancel_assistant_task(assistant_task, session_id)
        
    except asyncio.CancelledError:
        logger.info(f"Voice session cancelled for session: {session_id}")
        await _cancel_assistant_task(assistant_task, session_id)
        raise
        
    except Exception as e:
        logger.error(f"Error in voice WebSocket: {e}", exc_info=True)
        await _cancel_assistant_task(assistant_task, session_id)
        
        # Try to close gracefully
        try:
            if websocket.client_state.CONNECTED:
                await websocket.close(code=1011, reason="Internal server error")
        except:
            pass
            
    finally:
        logger.info(f"Cleaning up session: {session_id}")
        
        # Stop assistant
        if assistant:
            try:
                await assistant.stop()
            except Exception as e:
                logger.error(f"Error stopping assistant: {e}")
        
        # Clean up session resources
        if session_id:
            try:
                await session_service.cleanup_session(session_id)
            except Exception as e:
                logger.error(f"Error cleaning up session: {e}")


async def _cancel_assistant_task(assistant_task, session_id: str) -> None:
    """Cancel an assistant task gracefully."""
    if assistant_task and not assistant_task.done():
        logger.info(f"Cancelling assistant task for session: {session_id}")
        assistant_task.cancel()
        try:
            await assistant_task
        except asyncio.CancelledError:
            logger.info(f"Assistant task cancelled successfully for session: {session_id}")


async def _prepare_initial_context(
    session_id: str,
    custom_parameters: Dict[str, Any],
) -> tuple[str, Optional[str]]:
    """
    Auto-start the recipe when the frontend indicates it is already in cooking mode.
    
    Returns:
        Tuple containing the greeting the assistant should use and the active recipe id.
    """
    mode = (custom_parameters or {}).get("mode")
    recipe_payload = _extract_recipe_payload(custom_parameters)
    if recipe_payload:
        session_service.set_session_recipe_payload(session_id, recipe_payload)

    recipe_id = _extract_recipe_id(custom_parameters) or (
        recipe_payload.get("recipe", {}).get("id") if recipe_payload else None
    )

    if recipe_id:
        session_service.set_session_recipe(session_id, recipe_id)

    if mode != "cooking":
        return DEFAULT_HELLO_MESSAGE, None

    if not recipe_id or not recipe_payload:
        logger.warning(
            "Cooking mode requested without complete recipe context "
            "(recipe_id=%s, payload_present=%s). Session=%s",
            recipe_id,
            bool(recipe_payload),
            session_id,
        )
        return (
            "I'm ready to help, but I didn't receive the recipe details. "
            "Please reopen the recipe in the app so I can guide you step by step.",
            None,
        )

    resume_index = int(custom_parameters.get("resumeStepIndex") or -1)

    try:
        logger.info(
            "Auto-start requested from frontend context. Session=%s, recipe_id=%s, resume_index=%s",
            session_id,
            recipe_id,
            resume_index,
        )
        await run_recipe_tool(
            session_id=session_id,
            tool_fn=start_recipe_tool,
            recipe_id=recipe_id,
            recipe_payload=recipe_payload,
            resume_step_index=resume_index,
        )
        greeting = _build_cooking_greeting(recipe_payload)
        logger.info("✅ Recipe %s started automatically for session %s", recipe_id, session_id)
        return greeting, recipe_id
    except Exception as exc:
        logger.error(f"Failed to auto-start recipe {recipe_id}: {exc}", exc_info=True)
        return DEFAULT_HELLO_MESSAGE, None


def _extract_recipe_id(custom_parameters: Dict[str, Any]) -> Optional[str]:
    """Extract a valid recipe identifier from custom parameters."""
    raw_id = (
        custom_parameters.get("recipeId")
        or custom_parameters.get("recipe_id")
        or custom_parameters.get("recipe")
    )
    if not raw_id:
        return None
    recipe_id = str(raw_id).strip()
    return recipe_id or None


def _build_cooking_greeting(recipe_payload: Optional[Dict[str, Any]]) -> str:
    """Generate a warm, Jamie Oliver-style greeting."""
    if not recipe_payload:
        return DEFAULT_HELLO_MESSAGE

    recipe_meta = recipe_payload.get("recipe", {})
    title = recipe_meta.get("title") or "something delicious"
    description = recipe_meta.get("description", "")
    
    # Build a warm, conversational greeting
    greetings = [
        f"Alright! {title} - this is going to be gorgeous!",
        f"Right then, let's make some {title}!",
        f"Lovely choice! {title} is absolutely delicious.",
        f"Oh brilliant, {title}! You're going to love this one.",
    ]
    
    import random
    greeting = random.choice(greetings)
    
    if description:
        greeting += f" {description}."
    
    # Get the first step's on_enter.say text (already TTS-friendly)
    # This avoids symbols like °C that don't pronounce well
    first_step_say = _get_first_step_say_text(recipe_payload)
    if first_step_say:
        greeting += f" {first_step_say}"
    else:
        greeting += " Let's get started!"
    
    return greeting


def _get_first_step_say_text(recipe_payload: Dict[str, Any]) -> Optional[str]:
    """Get the TTS-friendly on_enter.say text from the first step."""
    steps = recipe_payload.get("steps") or []
    if not steps:
        return None
    
    # Find first step without dependencies
    prioritized = sorted(
        steps,
        key=lambda step: len(step.get("depends_on") or []),
    )
    
    for step in prioritized:
        if not step.get("depends_on"):
            # Prefer on_enter.say (TTS-friendly) over descr/instructions
            on_enter = step.get("on_enter", [])
            if isinstance(on_enter, list):
                for action in on_enter:
                    if isinstance(action, dict) and action.get("say"):
                        return action["say"]
            elif isinstance(on_enter, dict) and on_enter.get("say"):
                return on_enter["say"]
            # Fallback: don't use descr/instructions as they may have symbols
            return None
    
    return None


def _get_first_step_description(recipe_payload: Dict[str, Any]) -> Optional[str]:
    """Pick the first actionable step description (raw text, may have symbols)."""
    steps = recipe_payload.get("steps") or []
    if not steps:
        return None
    
    prioritized = sorted(
        steps,
        key=lambda step: len(step.get("depends_on") or []),
    )
    for step in prioritized:
        if not step.get("depends_on"):
            return step.get("instructions") or step.get("descr")
    
    # Fallback to the first step if all have dependencies defined
    step = steps[0]
    return step.get("instructions") or step.get("descr")


def _extract_recipe_payload(custom_parameters: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract raw recipe payload if provided by the frontend."""
    payload = (
        custom_parameters.get("recipePayload")
        or custom_parameters.get("recipe_payload")
        or custom_parameters.get("recipe_json")
    )
    return payload if isinstance(payload, dict) else None


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info"
    )
