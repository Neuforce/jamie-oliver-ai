"""
Voice handler for chat discovery agent.

Provides WebSocket-based voice interface using CCAI components:
- Deepgram STT for speech-to-text
- DiscoveryChatAgent for processing
- ElevenLabs TTS for text-to-speech
"""

import os
import json
import asyncio
import base64
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass

from fastapi import WebSocket
from fastapi.websockets import WebSocketState

from ccai.core.speech_to_text.stt_deepgram import DeepgramSTTService
from ccai.core.text_to_speech.elevenlabs_tts import ElevenLabsTextToSpeech
from ccai.core.logger import configure_logger

from recipe_search_agent.chat_agent import DiscoveryChatAgent, ChatEvent

logger = configure_logger(__name__)


@dataclass
class VoiceConfig:
    """Configuration for voice services."""
    deepgram_api_key: str
    elevenlabs_api_key: str
    elevenlabs_voice_id: str
    sample_rate: int = 16000
    tts_output_format: str = "pcm_16000"  # PCM for browser playback
    tts_speed: float = 1.0
    stt_language: str = "en-US"
    stt_endpointing_ms: int = 250


def get_voice_config() -> VoiceConfig:
    """Get voice configuration from environment variables."""
    deepgram_key = os.getenv("DEEPGRAM_API_KEY")
    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY")
    elevenlabs_voice = os.getenv("ELEVENLABS_VOICE_ID")
    
    if not deepgram_key:
        raise ValueError("DEEPGRAM_API_KEY is required for voice chat")
    if not elevenlabs_key:
        raise ValueError("ELEVENLABS_API_KEY is required for voice chat")
    if not elevenlabs_voice:
        raise ValueError("ELEVENLABS_VOICE_ID is required for voice chat")
    
    return VoiceConfig(
        deepgram_api_key=deepgram_key,
        elevenlabs_api_key=elevenlabs_key,
        elevenlabs_voice_id=elevenlabs_voice,
        sample_rate=int(os.getenv("VOICE_SAMPLE_RATE", "16000")),
        tts_speed=float(os.getenv("TTS_SPEED", "1.0")),
        stt_language=os.getenv("STT_LANGUAGE", "en-US"),
    )


class VoiceChatHandler:
    """
    Handles voice chat sessions for recipe discovery.
    
    Manages the full pipeline:
    1. Receive audio from WebSocket
    2. Transcribe with Deepgram
    3. Process with DiscoveryChatAgent
    4. Synthesize response with ElevenLabs
    5. Stream audio and text back to client
    """
    
    def __init__(
        self,
        websocket: WebSocket,
        chat_agent: DiscoveryChatAgent,
        config: VoiceConfig,
    ):
        self.websocket = websocket
        self.chat_agent = chat_agent
        self.config = config
        
        self.session_id: Optional[str] = None
        self.is_running = False
        self.is_listening = False
        self.is_speaking = False
        
        # Audio queue for incoming audio chunks
        self.audio_queue: asyncio.Queue[bytes] = asyncio.Queue()
        
        # Initialize STT
        self.stt = DeepgramSTTService(
            api_key=config.deepgram_api_key,
            sample_rate=config.sample_rate,
            language=config.stt_language,
            endpointing=config.stt_endpointing_ms,
        )
        
        # Initialize TTS
        self.tts = ElevenLabsTextToSpeech(
            api_key=config.elevenlabs_api_key,
            voice_id=config.elevenlabs_voice_id,
            speed=config.tts_speed,
            output_format=config.tts_output_format,
        )
    
    @property
    def is_connected(self) -> bool:
        """Check if WebSocket is still connected."""
        return (
            self.websocket.application_state == WebSocketState.CONNECTED
            and self.websocket.client_state == WebSocketState.CONNECTED
        )
    
    async def send_event(self, event_type: str, data: Any = None):
        """Send an event to the client."""
        if not self.is_connected:
            return
        
        message = {"event": event_type}
        if data is not None:
            message["data"] = data
        
        try:
            await self.websocket.send_json(message)
        except Exception as e:
            logger.warning(f"Failed to send event {event_type}: {e}")
    
    async def send_audio(self, audio_bytes: bytes):
        """Send audio data to the client."""
        if not self.is_connected:
            return
        
        try:
            # Encode audio as base64 for JSON transport
            audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
            await self.websocket.send_json({
                "event": "audio",
                "data": audio_b64,
            })
        except Exception as e:
            logger.warning(f"Failed to send audio: {e}")
    
    async def handle_connection(self):
        """
        Main handler for voice chat WebSocket connection.
        
        Protocol:
        - Client sends: {"event": "start", "sessionId": "...", "sampleRate": 16000}
        - Client sends: {"event": "audio", "data": "base64_pcm_data"}
        - Client sends: {"event": "stop"}
        - Server sends: {"event": "listening"}
        - Server sends: {"event": "processing"}
        - Server sends: {"event": "text_chunk", "data": "..."}
        - Server sends: {"event": "audio", "data": "base64_pcm_data"}
        - Server sends: {"event": "recipes", "data": [...]}
        - Server sends: {"event": "done"}
        """
        await self.websocket.accept()
        self.is_running = True
        
        try:
            # Wait for start message
            start_msg = await self.websocket.receive_json()
            if start_msg.get("event") != "start":
                await self.send_event("error", "Expected 'start' event")
                return
            
            self.session_id = start_msg.get("sessionId", f"voice_{id(self)}")
            sample_rate = start_msg.get("sampleRate", 16000)
            logger.info(f"Voice chat started: session={self.session_id}, sample_rate={sample_rate}")
            
            # Update STT sample rate if needed
            if sample_rate != self.config.sample_rate:
                self.stt = DeepgramSTTService(
                    api_key=self.config.deepgram_api_key,
                    sample_rate=sample_rate,
                    language=self.config.stt_language,
                    endpointing=self.config.stt_endpointing_ms,
                )
            
            await self.send_event("session_info", {
                "session_id": self.session_id,
                "sample_rate": sample_rate,
            })
            
            # Start receiving audio in background
            receive_task = asyncio.create_task(self._receive_audio_loop())
            
            # Process audio through STT and agent
            await self._process_voice_loop()
            
            # Cleanup
            receive_task.cancel()
            try:
                await receive_task
            except asyncio.CancelledError:
                pass
            
        except Exception as e:
            logger.error(f"Error in voice chat handler: {e}", exc_info=True)
            await self.send_event("error", str(e))
        finally:
            self.is_running = False
            logger.info(f"Voice chat ended: session={self.session_id}")
    
    async def _receive_audio_loop(self):
        """Background task to receive audio from WebSocket."""
        try:
            while self.is_running and self.is_connected:
                try:
                    message = await asyncio.wait_for(
                        self.websocket.receive_json(),
                        timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue
                
                event_type = message.get("event")
                
                if event_type == "audio":
                    # Decode and queue audio
                    audio_b64 = message.get("data", "")
                    if audio_b64:
                        try:
                            audio_bytes = base64.b64decode(audio_b64)
                            await self.audio_queue.put(audio_bytes)
                        except Exception as e:
                            logger.warning(f"Failed to decode audio: {e}")
                
                elif event_type == "stop":
                    logger.info(f"Stop received for session {self.session_id}")
                    self.is_running = False
                    break
                
                elif event_type == "interrupt":
                    # User interrupted while Jamie is speaking
                    logger.info(f"Interrupt received for session {self.session_id}")
                    self.is_speaking = False
                    # Clear any pending audio
                    while not self.audio_queue.empty():
                        try:
                            self.audio_queue.get_nowait()
                        except asyncio.QueueEmpty:
                            break
        
        except asyncio.CancelledError:
            logger.debug("Audio receive loop cancelled")
        except Exception as e:
            logger.error(f"Error in audio receive loop: {e}")
            self.is_running = False
    
    async def _audio_stream_generator(self):
        """Generate audio chunks from the queue for STT."""
        while self.is_running:
            try:
                # Get audio with timeout
                audio_bytes = await asyncio.wait_for(
                    self.audio_queue.get(),
                    timeout=0.5
                )
                yield audio_bytes
            except asyncio.TimeoutError:
                # No audio available, continue waiting
                if not self.is_listening:
                    break
                continue
            except Exception as e:
                logger.error(f"Error in audio stream: {e}")
                break
    
    async def _process_voice_loop(self):
        """Main loop for processing voice input."""
        while self.is_running and self.is_connected:
            # Signal that we're listening
            self.is_listening = True
            await self.send_event("listening")
            
            # Transcribe incoming audio
            transcription = ""
            try:
                async for result in self.stt.transcribe(self._audio_stream_generator()):
                    if result.is_final and result.content.strip():
                        transcription = result.content.strip()
                        logger.info(f"Transcribed: {transcription}")
                        break
                    elif not result.is_final and result.content.strip():
                        # Send interim results for UI feedback
                        await self.send_event("transcript_interim", result.content)
            except Exception as e:
                logger.error(f"STT error: {e}", exc_info=True)
                await self.send_event("error", f"Speech recognition error: {e}")
                continue
            
            self.is_listening = False
            
            if not transcription:
                # No speech detected, continue listening
                continue
            
            # Send final transcription
            await self.send_event("transcript_final", transcription)
            
            # Process through chat agent
            await self.send_event("processing")
            self.is_speaking = True
            
            try:
                await self._process_and_respond(transcription)
            except Exception as e:
                logger.error(f"Chat processing error: {e}", exc_info=True)
                await self.send_event("error", f"Processing error: {e}")
            finally:
                self.is_speaking = False
                await self.send_event("done")
    
    async def _process_and_respond(self, message: str):
        """Process message through chat agent and generate voice response."""
        full_text = ""
        text_buffer = ""
        tool_events_count = 0
        
        logger.info(f"Processing voice message: {message[:100]}...")
        
        # Process through chat agent - identical to text chat for consistent experience
        async for event in self.chat_agent.chat(message, self.session_id):
            logger.debug(f"Chat event: type={event.type}, content_len={len(event.content) if event.content else 0}")
            
            if event.type == "text_chunk":
                text_buffer += event.content
                full_text += event.content
                
                # Send text chunks to client
                await self.send_event("text_chunk", event.content)
                
                # Synthesize audio when we have a complete sentence or enough text
                if self._should_synthesize(text_buffer):
                    await self._synthesize_and_send(text_buffer)
                    text_buffer = ""
            
            elif event.type == "recipes":
                # Send recipe results
                tool_events_count += 1
                recipe_count = len(event.metadata.get("recipes", [])) if event.metadata else 0
                logger.info(f"Sending {recipe_count} recipes to client")
                await self.send_event("recipes", event.metadata)
            
            elif event.type == "meal_plan":
                tool_events_count += 1
                logger.info(f"Sending meal_plan to client: {event.metadata.get('occasion') if event.metadata else 'unknown'}")
                await self.send_event("meal_plan", event.metadata)
            
            elif event.type == "recipe_detail":
                tool_events_count += 1
                logger.info(f"Sending recipe_detail to client")
                await self.send_event("recipe_detail", event.metadata)
            
            elif event.type == "shopping_list":
                tool_events_count += 1
                logger.info(f"Sending shopping_list to client")
                await self.send_event("shopping_list", event.metadata)
            
            elif event.type == "tool_call":
                # Notify client that a tool is being called
                logger.info(f"Tool being called: {event.content}")
                await self.send_event("tool_call", {
                    "name": event.content,
                    "arguments": event.metadata.get("arguments") if event.metadata else None,
                })
            
            elif event.type == "error":
                logger.error(f"Chat error: {event.content}")
                await self.send_event("error", event.content)
        
        logger.info(f"Voice response complete: text_len={len(full_text)}, tool_events={tool_events_count}")
        
        # Synthesize any remaining text
        if text_buffer.strip():
            await self._synthesize_and_send(text_buffer)
    
    def _should_synthesize(self, text: str) -> bool:
        """Determine if we should synthesize the current text buffer."""
        # Synthesize on sentence boundaries
        if any(text.rstrip().endswith(p) for p in ['.', '!', '?', ':', ';']):
            return True
        
        # Synthesize if we have enough text (for long streaming responses)
        words = text.split()
        if len(words) >= 15:
            return True
        
        return False
    
    async def _synthesize_and_send(self, text: str):
        """Synthesize text to speech and send audio to client."""
        if not text.strip() or not self.is_speaking:
            return
        
        try:
            async for audio_chunk in self.tts.synthesize(text):
                if not self.is_speaking:
                    # User interrupted
                    break
                await self.send_audio(audio_chunk)
        except Exception as e:
            logger.error(f"TTS error: {e}", exc_info=True)


async def handle_voice_chat(
    websocket: WebSocket,
    chat_agent: DiscoveryChatAgent,
):
    """
    Handle a voice chat WebSocket connection.
    
    Args:
        websocket: FastAPI WebSocket connection
        chat_agent: DiscoveryChatAgent instance
    """
    try:
        config = get_voice_config()
    except ValueError as e:
        await websocket.accept()
        await websocket.send_json({
            "event": "error",
            "data": f"Voice chat not configured: {e}"
        })
        await websocket.close(code=1011, reason="Voice not configured")
        return
    
    handler = VoiceChatHandler(
        websocket=websocket,
        chat_agent=chat_agent,
        config=config,
    )
    
    await handler.handle_connection()
