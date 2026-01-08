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
from src.services.recipe_registry import recipe_registry
from src.services.tool_runner import run_recipe_tool
from src.tools.recipe_tools import (
    start_recipe as start_recipe_tool,
    confirm_step_done as confirm_step_tool,
)

logger = configure_logger(__name__)

DEFAULT_HELLO_MESSAGE = (
    "Hello! I'm your cooking assistant. Ask me what recipes are available "
    "or tell me what you'd like to cook, and I'll guide you step by step."
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown events."""
    logger.info("🚀 Starting Jamie Oliver AI Backend...")
    
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


def _load_recipe_or_404(recipe_id: str) -> dict:
    try:
        return recipe_registry.get_recipe_payload(recipe_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Recipe not found")
    except RuntimeError as exc:
        logger.error(f"Failed to load recipe {recipe_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/recipes")
async def list_recipes():
    """Return available recipe metadata."""
    return recipe_registry.list_recipes()


@app.get("/recipes/current")
async def get_current_recipe():
    """
    Return the default recipe metadata, ingredients, utensils, and steps
    so the frontend can render the guided experience.
    """
    default_id = recipe_registry.default_recipe_id
    if not default_id:
        raise HTTPException(status_code=404, detail="No recipes available")
    return _load_recipe_or_404(default_id)


@app.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str):
    """Return a specific recipe payload."""
    return _load_recipe_or_404(recipe_id)


@app.post("/sessions/{session_id}/steps/{step_id}/confirm")
async def confirm_step_for_session(session_id: str, step_id: str):
    """
    Confirm a recipe step for a given session.
    Allows the frontend to mark a step as done without voice input.
    """
    engine = session_service.get_engine(session_id)
    if not engine:
        raise HTTPException(status_code=404, detail="Session not found")
    
    step = engine.recipe.steps.get(step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found for current recipe")

    try:
        tool_message = await run_recipe_tool(
            session_id,
            confirm_step_tool,
            step_id=step_id,
        )
    except Exception as exc:
        logger.error(f"Failed to confirm step {step_id} for {session_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Unable to confirm step: {exc}")

    assistant = session_service.get_assistant(session_id)
    if assistant:
        try:
            system_message = (
                f"[SYSTEM: Step '{step.descr}' (step_id: {step_id}) has been marked as complete "
                f"via the frontend. The user has finished this step.]"
            )
            await assistant.inject_system_message(system_message)
            logger.info(f"✅ Injected system message to assistant for step confirmation: {step_id}")
        except Exception as e:
            logger.warning(f"Failed to inject system message to assistant: {e}")
    else:
        logger.debug(f"No assistant registered for session {session_id}, skipping system message injection")
    
    state = engine.get_state()
    state["has_recipe"] = True
    return {"state": state, "message": tool_message}


@app.post("/sessions/{session_id}/recipes/{recipe_id}/start")
async def start_recipe_for_session(session_id: str, recipe_id: str):
    """
    Start or switch the active recipe for an existing session.
    Mirrors the start_recipe tool for UI-driven interactions.
    """
    event_callback = session_service.get_event_callback(session_id)
    if not event_callback:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        payload = recipe_registry.get_recipe_payload(recipe_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Recipe not found")
    except RuntimeError as exc:
        logger.error(f"Failed to load recipe {recipe_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        start_message = await run_recipe_tool(
            session_id,
            start_recipe_tool,
            recipe_id=recipe_id,
        )
    except Exception as exc:
        logger.error(f"Failed to start recipe via tool {recipe_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Unable to start recipe session")
    
    engine = session_service.get_engine(session_id)
    if not engine:
        raise HTTPException(status_code=500, detail="Recipe engine not initialized")
    
    state = engine.get_state()
    state["has_recipe"] = True
    return {"message": start_message, "state": state, "recipe": payload}

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
    recipe_id = _extract_recipe_id(custom_parameters)
    
    if mode != "cooking" or not recipe_id:
        return DEFAULT_HELLO_MESSAGE, None
    
    try:
        logger.info(
            f"Auto-start requested from frontend context. "
            f"Session={session_id}, recipe_id={recipe_id}"
        )
        session_service.set_session_recipe(session_id, recipe_id)
        await run_recipe_tool(
            session_id=session_id,
            tool_fn=start_recipe_tool,
            recipe_id=recipe_id,
        )
        recipe_payload = recipe_registry.get_recipe_payload(recipe_id)
        greeting = _build_cooking_greeting(recipe_payload)
        logger.info(f"✅ Recipe {recipe_id} started automatically for session {session_id}")
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


def _build_cooking_greeting(recipe_payload: Dict[str, Any]) -> str:
    """Generate a friendly greeting that jumps straight into the first step."""
    recipe_meta = recipe_payload.get("recipe", {})
    title = recipe_meta.get("title") or "this recipe"
    first_step = _get_first_step_description(recipe_payload)
    if first_step:
        return (
            f"Great, we're already cooking {title}. "
            f"Let's begin with the first step: {first_step}. "
            "Just let me know when you want to move on."
        )
    return (
        f"Great, we're already cooking {title}. "
        "I'm ready to guide you through each step."
    )


def _get_first_step_description(recipe_payload: Dict[str, Any]) -> Optional[str]:
    """Pick the first actionable step description."""
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


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info"
    )
