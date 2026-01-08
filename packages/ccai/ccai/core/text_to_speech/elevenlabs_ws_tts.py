import asyncio
import json
import time
import base64
from typing import AsyncGenerator, Optional
import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

from .base import BaseTextToSpeech
from ccai.core.logger import configure_logger
from ccai.core.tracing import observe_speech_processing

logger = configure_logger(__name__)


class ElevenLabsWebSocketTTS(BaseTextToSpeech):
    """
    ElevenLabs Text-to-Speech using WebSocket streaming API.
    
    This implementation maintains a persistent WebSocket connection for lower latency
    and supports streaming text input, making it ideal for real-time voice assistants.
    """

    def __init__(
        self,
        api_key: str,
        voice_id: str,
        similarity_boost: float = 0.8,
        stability: float = 0.5,
        speed: float = 1.0,
        speaker_boost: bool = True,
        output_format: str = "ulaw_8000",
        model_id: str = "eleven_flash_v2_5",
        enable_ssml_parsing: bool = False,
        auto_mode: bool = False,
        sync_alignment: bool = False,
        inactivity_timeout: int = 60,
    ):
        self.api_key = api_key
        self.voice_id = voice_id
        self.similarity_boost = similarity_boost
        self.stability = stability
        self.speed = speed
        self.speaker_boost = speaker_boost
        self.output_format = output_format
        self.model_id = model_id
        self.enable_ssml_parsing = enable_ssml_parsing
        self.auto_mode = auto_mode
        self.sync_alignment = sync_alignment
        self.inactivity_timeout = inactivity_timeout
        
        # Connection management
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.connection_lock = asyncio.Lock()
        self.is_connecting = False
        
        # Audio streaming - using per-synthesis queues for better performance
        self.receive_task: Optional[asyncio.Task] = None
        self.is_initialized = False
        self._active_synthesis_queue: Optional[asyncio.Queue] = None

    async def _connect(self) -> bool:
        """Establish WebSocket connection to ElevenLabs."""
        if self.is_connecting:
            return False
            
        async with self.connection_lock:
            if self.websocket and not self.websocket.closed:
                return True
                
            try:
                self.is_connecting = True
                
                # Build WebSocket URL with query parameters
                url = f"wss://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/stream-input"
                params = {
                    "model_id": self.model_id,
                    "output_format": self.output_format,
                    "enable_ssml_parsing": str(self.enable_ssml_parsing).lower(),
                    "auto_mode": str(self.auto_mode).lower(),
                    "sync_alignment": str(self.sync_alignment).lower(),
                    "inactivity_timeout": str(self.inactivity_timeout),
                }
                
                # Add query parameters to URL
                query_string = "&".join([f"{k}={v}" for k, v in params.items()])
                full_url = f"{url}?{query_string}"
                
                # Connect with API key in headers
                headers = {"xi-api-key": self.api_key}
                
                logger.info(f"Connecting to ElevenLabs WebSocket: {url}")
                self.websocket = await websockets.connect(
                    full_url,
                    extra_headers=headers,
                    ping_interval=30,
                    ping_timeout=10,
                )
                
                # Start receiving task
                self.receive_task = asyncio.create_task(self._receive_audio())
                
                # Send initial configuration
                await self._initialize_connection()
                
                logger.info("Successfully connected to ElevenLabs WebSocket")
                return True
                
            except Exception as e:
                logger.error(f"Failed to connect to ElevenLabs WebSocket: {e}")
                self.websocket = None
                return False
            finally:
                self.is_connecting = False

    async def _initialize_connection(self):
        """Send initial configuration message."""
        if not self.websocket:
            return
            
        init_message = {
            "text": " ",  # Initial space as per API docs
            "voice_settings": {
                "speed": self.speed,
                "stability": self.stability,
                "similarity_boost": self.similarity_boost,
                "use_speaker_boost": self.speaker_boost,
            },
            "xi_api_key": self.api_key,
        }
        
        await self.websocket.send(json.dumps(init_message))
        self.is_initialized = True
        logger.debug("Sent initialization message to ElevenLabs WebSocket")

    async def _receive_audio(self):
        """Continuously receive audio data from WebSocket."""
        try:
            while self.websocket and not self.websocket.closed:
                try:
                    message = await self.websocket.recv()
                    data = json.loads(message)
                    
                    if "audio" in data:
                        # Decode base64 audio data
                        audio_data = base64.b64decode(data["audio"])
                        
                        # Check if we have active synthesis sessions waiting for this audio
                        if hasattr(self, '_active_synthesis_queue') and self._active_synthesis_queue:
                            await self._active_synthesis_queue.put(audio_data)
                        
                        # Log alignment info if available for debugging
                        if "alignment" in data and logger.isEnabledFor(10):  # DEBUG level
                            chars = data["alignment"].get("chars", [])
                            text_chunk = "".join(chars)
                            logger.debug(f"Received audio for text: '{text_chunk}'")
                    
                    elif "isFinal" in data and data["isFinal"]:
                        # Signal end of audio stream
                        if hasattr(self, '_active_synthesis_queue') and self._active_synthesis_queue:
                            await self._active_synthesis_queue.put(None)
                        logger.debug("Received final audio chunk signal")
                        
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode WebSocket message: {e}")
                except Exception as e:
                    logger.error(f"Error processing WebSocket message: {e}")
                    
        except ConnectionClosed:
            logger.info("WebSocket connection closed")
        except Exception as e:
            logger.error(f"Error in audio receive task: {e}")
        finally:
            # Signal end of stream
            if hasattr(self, '_active_synthesis_queue') and self._active_synthesis_queue:
                try:
                    await self._active_synthesis_queue.put(None)
                except:
                    pass

    async def _ensure_connected(self) -> bool:
        """Ensure WebSocket connection is established."""
        if self.websocket and not self.websocket.closed and self.is_initialized:
            return True
            
        return await self._connect()

    @observe_speech_processing("synthesis", "elevenlabs_ws")
    async def synthesize(self, text: str) -> AsyncGenerator[bytes, None]:
        """
        Synthesize text to speech using WebSocket streaming.
        
        This optimized version creates a dedicated queue per synthesis request
        for maximum streaming performance and minimal latency.
        
        Args:
            text: Text to synthesize
            
        Yields:
            Audio chunks as bytes
        """
        if not text.strip():
            return
            
        start_time = time.perf_counter()
        first_chunk = True
        
        # Create a dedicated queue for this synthesis session
        synthesis_queue = asyncio.Queue()
        self._active_synthesis_queue = synthesis_queue
        
        try:
            # Ensure connection is established
            if not await self._ensure_connected():
                raise Exception("Failed to establish WebSocket connection")
            
            # Send text to synthesize
            text_message = {
                "text": text,
                "try_trigger_generation": True
            }
            
            await self.websocket.send(json.dumps(text_message))
            logger.debug(f"Sent text for synthesis: '{text}'")
            
            # Send empty message to signal end of text
            end_message = {"text": ""}
            await self.websocket.send(json.dumps(end_message))
            
            # Yield audio chunks as they arrive - direct streaming!
            while True:
                try:
                    # Wait for audio with timeout
                    audio_chunk = await asyncio.wait_for(
                        synthesis_queue.get(), timeout=10.0
                    )
                    
                    if audio_chunk is None:
                        # End of stream signal
                        break
                        
                    if first_chunk:
                        latency = time.perf_counter() - start_time
                        logger.info(f"WebSocket TTS time to first chunk: {latency:.3f}s - Text: {text}")
                        first_chunk = False
                        
                    # IMMEDIATE YIELD - no additional queueing!
                    yield audio_chunk
                    
                except asyncio.TimeoutError:
                    logger.warning("Timeout waiting for audio chunk from WebSocket")
                    break
                    
        except ConnectionClosed:
            logger.error("WebSocket connection lost during synthesis")
            # Try to reconnect for next synthesis
            self.websocket = None
            self.is_initialized = False
            raise
        except Exception as e:
            logger.error(f"Error in WebSocket synthesis: {e}")
            raise
        finally:
            # Clean up the synthesis queue
            self._active_synthesis_queue = None

    async def stream_text_synthesis(self, text_chunks: AsyncGenerator[str, None]) -> AsyncGenerator[bytes, None]:
        """
        Real-time streaming synthesis using ElevenLabs WebSocket API.
        
        Sends text incrementally and gets continuous audio back for smooth,
        natural-sounding speech without chunking artifacts.
        
        Args:
            text_chunks: AsyncGenerator yielding text chunks as they become available
            
        Yields:
            Audio chunks as bytes - continuous, smooth audio stream
        """
        if not await self._ensure_connected():
            raise Exception("Failed to establish WebSocket connection")
        
        start_time = time.perf_counter()
        first_chunk = True
        
        # Create dedicated queue for this streaming session
        synthesis_queue = asyncio.Queue()
        self._active_synthesis_queue = synthesis_queue
        
        try:
            # Task to send text as it becomes available
            async def send_text_stream():
                try:
                    sentence_buffer = ""
                    
                    async for text_chunk in text_chunks:
                        if text_chunk.strip():
                            sentence_buffer += text_chunk
                            
                            # Send the incremental text
                            message = {
                                "text": text_chunk,
                                "try_trigger_generation": False  # Build up text first
                            }
                            await self.websocket.send(json.dumps(message))
                            logger.debug(f"Streamed text: '{text_chunk}'")
                            
                            # If we have a sentence or significant content, trigger generation
                            if any(punct in sentence_buffer for punct in '.!?') or len(sentence_buffer.split()) >= 8:
                                trigger_message = {"text": "", "try_trigger_generation": True}
                                await self.websocket.send(json.dumps(trigger_message))
                                logger.debug("Triggered generation for accumulated text")
                                sentence_buffer = ""  # Reset buffer
                    
                    # Final trigger for any remaining text
                    if sentence_buffer.strip():
                        trigger_message = {"text": "", "try_trigger_generation": True}
                        await self.websocket.send(json.dumps(trigger_message))
                    
                    # Signal end of stream
                    end_message = {"text": ""}
                    await self.websocket.send(json.dumps(end_message))
                    logger.debug("Completed text streaming")
                    
                except Exception as e:
                    logger.error(f"Error in text streaming: {e}")
            
            # Start text streaming task
            text_task = asyncio.create_task(send_text_stream())
            
            try:
                # Stream audio as it arrives
                while True:
                    try:
                        audio_chunk = await asyncio.wait_for(
                            synthesis_queue.get(), timeout=20.0
                        )
                        
                        if audio_chunk is None:
                            break
                            
                        if first_chunk:
                            latency = time.perf_counter() - start_time
                            logger.info(f"Real-time streaming TTS first audio: {latency:.3f}s")
                            first_chunk = False
                            
                        yield audio_chunk
                        
                    except asyncio.TimeoutError:
                        logger.warning("Timeout waiting for streaming audio")
                        break
                        
            finally:
                if not text_task.done():
                    text_task.cancel()
                    try:
                        await text_task
                    except asyncio.CancelledError:
                        pass
                        
        finally:
            self._active_synthesis_queue = None

    async def send_text_chunk(self, text_chunk: str):
        """
        Send a text chunk for streaming synthesis.
        This can be used for real-time streaming of partial text.
        
        Args:
            text_chunk: Partial text to send
        """
        if not await self._ensure_connected():
            raise Exception("WebSocket connection not available")
            
        message = {
            "text": text_chunk,
            "try_trigger_generation": True  # Changed to True for immediate processing
        }
        
        await self.websocket.send(json.dumps(message))
        logger.debug(f"Sent text chunk: '{text_chunk}'")

    async def finalize_text(self):
        """Signal that no more text chunks will be sent."""
        if not self.websocket or self.websocket.closed:
            return
            
        # Send empty message to signal end
        end_message = {"text": ""}
        await self.websocket.send(json.dumps(end_message))
        logger.debug("Sent text finalization signal")

    async def close(self):
        """Close the WebSocket connection and cleanup resources."""
        logger.info("Closing ElevenLabs WebSocket TTS connection")
        
        # Cancel receive task
        if self.receive_task and not self.receive_task.done():
            self.receive_task.cancel()
            try:
                await self.receive_task
            except asyncio.CancelledError:
                pass
        
        # Close WebSocket connection
        if self.websocket and not self.websocket.closed:
            try:
                await self.websocket.close()
            except Exception as e:
                logger.error(f"Error closing WebSocket: {e}")
        
        self.websocket = None
        self.is_initialized = False
        
        # Clean up any remaining synthesis queue
        self._active_synthesis_queue = None
