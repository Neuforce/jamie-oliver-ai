"""Recipe event handler - processes events from the recipe engine."""

from typing import Optional

from ccai.core.logger import configure_logger
from ccai.core.audio_interface.audio_output.audio_output_service import AudioOutputService

from src.recipe_engine import Event, EventType

logger = configure_logger(__name__)


class RecipeEventHandler:
    """
    Handles recipe engine events and coordinates between the engine,
    frontend, and voice assistant.
    """
    
    def __init__(
        self,
        session_id: str,
        output_channel: AudioOutputService,
        get_engine_func,
        assistant=None
    ):
        """
        Initialize the event handler.
        
        Args:
            session_id: The session identifier
            output_channel: Audio output service for sending events to frontend
            get_engine_func: Function to get the recipe engine for this session
            assistant: Voice assistant instance (for injecting messages)
        """
        self.session_id = session_id
        self.output_channel = output_channel
        self.get_engine = get_engine_func
        self.assistant = assistant
    
    async def handle_event(self, event: Event) -> None:
        """
        Handle a recipe engine event.
        
        Args:
            event: The event to handle
        """
        logger.info(f"🎯 Recipe event received: {event.type.value} - {event.payload}")
        
        try:
            # Send state updates to frontend for key events
            if event.type in (
                EventType.STEP_START,
                EventType.STEP_COMPLETED,
                EventType.STEP_READY,
                EventType.ALL_COMPLETED,
                EventType.TIMER_SET
            ):
                await self._send_recipe_state()
            
            # When a timer is set, also send timer_start to frontend to sync the UI timer
            if event.type == EventType.TIMER_SET:
                duration_secs = event.payload.get("duration_secs", 0)
                step_id = event.payload.get("step_id")
                logger.info(f"🕐 TIMER_SET received for {step_id}, sending timer_start to frontend with {duration_secs}s")
                await self._send_control_event("timer_start", {"seconds": duration_secs})
            
            # Handle specific event types
            if event.type == EventType.TIMER_DONE:
                await self._handle_timer_done(event)
            
            elif event.type == EventType.ALL_COMPLETED:
                await self._handle_all_completed(event)
            
            elif event.type == EventType.REMINDER_TICK:
                await self._handle_reminder_tick(event)
            
            elif event.type == EventType.MESSAGE:
                await self._handle_message(event)
            
            elif event.type == EventType.ERROR:
                await self._handle_error(event)

            if event.type == EventType.STEP_START:
                await self._send_control_event("focus_step", {"step_id": event.payload.get("step_id")})
                
        except Exception as e:
            logger.error(f"❌ Error in recipe event handler: {e}", exc_info=True)
    
    async def _send_recipe_state(self) -> None:
        """Send the current recipe state to the frontend."""
        logger.info(f"📤 Sending recipe_state to frontend")
        engine = self.get_engine(self.session_id)
        if engine:
            state = engine.get_state()
            state["has_recipe"] = True
            logger.info(f"📊 Recipe state: {len(state.get('steps', []))} steps")
            await self.output_channel.send_event("recipe_state", state)
            logger.info("✅ Recipe state sent to frontend")
        else:
            logger.warning(f"⚠️  No engine found for session {self.session_id}")

    async def _send_control_event(self, action: str, data: Optional[dict] = None) -> None:
        """Send a control event to the frontend (best-effort)."""
        try:
            payload = {"action": action}
            if data:
                payload["data"] = data
            await self.output_channel.send_event("control", payload)
            logger.info(f"📡 Sent control event: {payload}")
        except Exception as exc:
            logger.error(f"Failed to send control event {action}: {exc}")
    
    async def _handle_timer_done(self, event: Event) -> None:
        """Handle timer completion event."""
        logger.info("⏰ Timer done event received")
        
        step_id = event.payload.get("step_id")
        step_descr = event.payload.get("descr", "a step")
        requires_confirm = event.payload.get("requires_confirm", False)
        
        # Send to frontend
        payload = {
            "type": "timer_done",
            "step_id": step_id,
            "descr": step_descr,
            "requires_confirm": requires_confirm,
        }
        await self.output_channel.send_event("manager_system", payload)
        logger.info(f"📤 manager_system(timer_done) sent to frontend: {payload}")
        
        if requires_confirm:
            # Proactive notification with speech for steps needing confirmation
            notification_msg = (
                f"Time's up on the {step_descr}! Let me know when you've checked it."
            )
            if self.assistant:
                await self.assistant.inject_system_message(notification_msg)
                logger.info("💬 Injected timer_done notification to agent")
        else:
            # Silent memory update for auto-completing steps
            context_msg = (
                f"[SYSTEM: Timer completed for '{step_descr}' (step_id: {step_id}). "
                f"This step auto-completed and is now done. User can continue with next steps.]"
            )
            if (self.assistant and 
                hasattr(self.assistant, 'brain') and 
                hasattr(self.assistant.brain, 'chat_memory')):
                self.assistant.brain.chat_memory.add_system_message(content=context_msg)
                logger.info(f"📝 Added auto-complete context to agent memory: {step_id}")
    
    async def _handle_all_completed(self, event: Event) -> None:
        """Handle recipe completion event."""
        completion_msg = (
            f"Brilliant! Your {event.payload.get('recipe_title')} is ready to serve. Enjoy!"
        )
        if self.assistant:
            await self.assistant.inject_system_message(completion_msg)
            logger.info("💬 Injected completion message to agent")
    
    async def _handle_reminder_tick(self, event: Event) -> None:
        """Handle reminder tick event."""
        logger.info("🔔 Reminder tick event received")
        
        step_id = event.payload.get("step_id")
        
        # Send to frontend
        payload = {
            "type": "reminder_tick",
            "step_id": step_id,
        }
        await self.output_channel.send_event("manager_system", payload)
        logger.info("📤 manager_system(reminder_tick) sent to frontend")
        
        # Gentle voice reminder
        reminder_msg = (
            "Just checking in - still waiting for confirmation on that step. No rush!"
        )
        if self.assistant:
            await self.assistant.inject_system_message(reminder_msg)
            logger.info("💬 Injected reminder to agent")
    
    async def _handle_message(self, event: Event) -> None:
        """Handle recipe message event."""
        msg = event.payload.get("message")
        if msg:
            logger.info(f"📨 Sending recipe_message to frontend: {msg}")
            await self.output_channel.send_event("recipe_message", {"message": msg})
    
    async def _handle_error(self, event: Event) -> None:
        """Handle error event."""
        error_msg = event.payload.get("msg", "Unknown error")
        logger.error(f"Recipe engine error: {error_msg}")
        await self.output_channel.send_event("recipe_error", {"message": error_msg})

