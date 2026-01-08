import asyncio
import re
import time
from typing import Tuple, Optional, Dict, Any, AsyncGenerator
from collections import deque

from ccai.core.brain.base import BaseBrain
from ccai.core.logger import configure_logger
from ccai.core.messages.base import UserMessage
from ccai.core.speech_to_text.base import BaseSpeechToText
from ccai.core.text_to_speech.base import BaseTextToSpeech
from ccai.core.text_to_speech.elevenlabs_ws_tts import ElevenLabsWebSocketTTS
from ccai.core.tracing import observe_voice_assistant, tracer
from ccai.core import context_variables
from .base import BaseVoiceAssistant

logger = configure_logger(__name__)


class OptimizedVoiceAssistant(BaseVoiceAssistant):
    """
    Ultra-high-performance voice assistant optimized for minimum latency.
    
    Key optimizations:
    - Parallel brain and TTS processing
    - Intelligent text chunking with early TTS trigger
    - Direct audio streaming without intermediate queues
    - WebSocket TTS streaming integration
    - Adaptive chunking based on content type
    """

    def __init__(
        self,
        stt: BaseSpeechToText,
        brain: BaseBrain,
        tts: BaseTextToSpeech,
        input_channel,
        output_channel,
        # Performance tuning options
        min_chunk_words: int = 3,  # Reduced from 8 for faster response
        enable_parallel_processing: bool = True,
        enable_word_level_streaming: bool = False,  # Ultra-fast mode
        chunk_timeout_ms: int = 150,  # Max time to wait for more text before sending
    ):
        """
        Initialize the OptimizedVoiceAssistant.

        Args:
            stt: Speech-to-text component
            brain: Brain component for processing messages  
            tts: Text-to-speech component (WebSocket TTS recommended)
            input_channel: Input channel for receiving audio data
            output_channel: Output channel for sending audio data
            min_chunk_words: Minimum words before triggering TTS (lower = faster)
            enable_parallel_processing: Enable parallel brain/TTS pipeline
            enable_word_level_streaming: Enable word-by-word streaming (fastest)
            chunk_timeout_ms: Max milliseconds to wait before forcing chunk send
        """
        self.stt = stt
        self.brain = brain
        self.tts = tts
        self.input_channel = input_channel
        self.output_channel = output_channel
        
        # Performance configuration
        self.min_chunk_words = min_chunk_words
        self.enable_parallel_processing = enable_parallel_processing
        self.enable_word_level_streaming = enable_word_level_streaming
        self.chunk_timeout_ms = chunk_timeout_ms / 1000.0  # Convert to seconds
        
        # Optimized brain processing
        self.brain_queue = asyncio.Queue()
        self.brain_task = None
        self.brain_processing = False
        self.current_transcription = None

        # Direct audio streaming (no intermediate queue for audio chunks)
        self.is_speaking = False
        self.active_synthesis_tasks = set()

    async def start(self, hello_message: Optional[str] = None):
        """Start the optimized voice assistant."""
        # Start the brain processor task
        self.brain_task = asyncio.create_task(self._process_brain_queue())

        # Queue the initial greeting
        if hello_message:
            self.brain.chat_memory.add_assistant_message(content=hello_message)
            await self._fast_synth_and_send(hello_message)

        async for transcription in self.stt.transcribe(self.input_channel):
            # Interrupt any ongoing speech output if there's new input
            if transcription.content:
                logger.info("Interrupting current output")
                await self.output_channel.clear()
                # Cancel active synthesis tasks for faster interruption
                await self._cancel_active_synthesis()
                self.is_speaking = False
                
                # Update the current transcription to the latest one
                self.current_transcription = transcription.content

            logger.debug(f"Received transcription: {transcription}")

            # Add final transcriptions to the brain queue for processing
            if transcription.is_final:
                await self.brain_queue.put(transcription.content)

    async def _cancel_active_synthesis(self):
        """Cancel all active synthesis tasks for faster interruption."""
        for task in list(self.active_synthesis_tasks):
            if not task.done():
                task.cancel()
        self.active_synthesis_tasks.clear()

    async def _process_brain_queue(self):
        """Process the brain queue with optimized performance."""
        while True:
            try:
                transcription = await self.brain_queue.get()
                self.brain_processing = True
                
                try:
                    if self.enable_parallel_processing and isinstance(self.tts, ElevenLabsWebSocketTTS):
                        # Use ultra-fast parallel processing with WebSocket TTS
                        await self._parallel_brain_process(transcription)
                    else:
                        # Use optimized sequential processing
                        await self._optimized_brain_process(transcription)
                        
                except Exception as e:
                    logger.error(f"Error in brain processing: {e}", exc_info=True)
                finally:
                    self.brain_queue.task_done()
                    self.brain_processing = False
                    
            except asyncio.CancelledError:
                logger.info("Brain queue processor was cancelled")
                break
            except Exception as e:
                logger.error(f"Error in brain queue processor: {e}")
                await asyncio.sleep(0.1)

    async def _parallel_brain_process(self, transcription: str):
        """
        ULTRA-FAST parallel processing: Stream text to TTS as brain generates it.
        This is the fastest possible approach - starts speaking while still thinking!
        """
        from langfuse import get_client
        langfuse = get_client()
        
        if not langfuse:
            return await self._optimized_brain_process(transcription)
            
        from langfuse import Langfuse
        new_trace_id = Langfuse.create_trace_id()
        with langfuse.start_as_current_span(
            name="parallel_conversation_turn",
            trace_context={"trace_id": new_trace_id}
        ) as turn_span:
            try:
                session_id = context_variables.get("session_id")
                user_id = context_variables.get("user_id")
                
                turn_span.update_trace(
                    session_id=session_id,
                    user_id=user_id,
                    input=transcription,
                    tags=["parallel_conversation_turn", "ccai", "optimized"]
                )
                
                start_time = time.perf_counter()
                
                # Create async generator for streaming text to TTS
                async def brain_text_stream():
                    try:
                        response = self.brain.process(UserMessage(content=transcription))
                        buffer = ""
                        
                        async for event in response:
                            buffer += event.content
                            
                            # Always use intelligent chunking for smooth audio
                            # Word-level streaming causes chunky audio with TTS
                            chunk, remainder = self._smart_chunk_detection(buffer)
                            if chunk:
                                yield chunk
                                buffer = remainder or ""
                        
                        # Send any remaining text
                        if buffer.strip():
                            yield buffer
                            
                    except Exception as e:
                        logger.error(f"Error in brain text stream: {e}")
                        raise
                
                # Use regular synthesis for now - much more reliable
                full_content = ""
                first_audio = True
                
                async for text_chunk in brain_text_stream():
                    full_content += text_chunk
                    
                    # Synthesize each meaningful chunk immediately
                    if text_chunk.strip():
                        async for audio_chunk in self.tts.synthesize(text_chunk):
                            if first_audio:
                                latency = time.perf_counter() - start_time
                                logger.info(f"PARALLEL processing - Time to first audio: {latency:.3f}s")
                                first_audio = False
                                self.is_speaking = True
                            
                            # Stream audio directly to output
                            await self.output_channel.send_audio(audio_chunk)
                
                self.is_speaking = False
                turn_span.update_trace(output=full_content)
                
            except Exception as e:
                turn_span.update(output={"error": str(e)}, level="ERROR")
                raise

    async def _optimized_brain_process(self, transcription: str):
        """Optimized sequential brain processing with smart chunking."""
        from langfuse import get_client
        langfuse = get_client()
        
        if not langfuse:
            return await self._optimized_brain_process_internal(transcription)
            
        from langfuse import Langfuse
        new_trace_id = Langfuse.create_trace_id()
        with langfuse.start_as_current_span(
            name="optimized_conversation_turn",
            trace_context={"trace_id": new_trace_id}
        ) as turn_span:
            try:
                session_id = context_variables.get("session_id")
                user_id = context_variables.get("user_id")
                
                turn_span.update_trace(
                    session_id=session_id,
                    user_id=user_id,
                    input=transcription,
                    tags=["optimized_conversation_turn", "ccai"]
                )
                
                full_content = await self._optimized_brain_process_internal(transcription)
                turn_span.update_trace(output=full_content)
                return full_content
                
            except Exception as e:
                turn_span.update(output={"error": str(e)}, level="ERROR")
                raise

    async def _optimized_brain_process_internal(self, transcription: str):
        """Internal optimized brain processing logic."""
        start_time = time.perf_counter()
        first_chunk = True
        
        try:
            response = self.brain.process(UserMessage(content=transcription))
            buffer = ""
            full_content = ""
            last_chunk_time = time.perf_counter()

            async for event in response:
                buffer += event.content
                full_content += event.content

                current_time = time.perf_counter()
                time_since_last_chunk = current_time - last_chunk_time

                # Smart chunking with multiple triggers
                chunk = None
                remainder = None

                # 1. Time-based trigger (prevent long waits)
                if time_since_last_chunk >= self.chunk_timeout_ms:
                    chunk = buffer
                    remainder = ""
                else:
                    # 2. Content-based intelligent chunking
                    chunk, remainder = self._smart_chunk_detection(buffer)

                if chunk:
                    # Send chunk to TTS immediately
                    await self._fast_synth_and_send(chunk)

                    if first_chunk:
                        first_chunk = False
                        latency = current_time - start_time
                        logger.info(f"Optimized Brain - Time to first speech: {latency:.3f}s. Text: {chunk}")

                    buffer = remainder or ""
                    last_chunk_time = current_time

            # Send any remaining text
            if buffer.strip():
                await self._fast_synth_and_send(buffer)

            return full_content

        except Exception as e:
            logger.error(f"Error during optimized brain processing: {e}")
            raise

    def _smart_chunk_detection(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Intelligent chunking that considers multiple factors for optimal TTS streaming.
        
        This is much more sophisticated than the original punctuation-only approach.
        """
        if not text.strip():
            return None, None
            
        words = text.split()
        
        # Early return if we don't have enough words yet
        if len(words) < self.min_chunk_words:
            return None, None
        
        # 1. Strong punctuation (immediate send)
        strong_punct_pattern = r"([.!?])\s+"
        strong_matches = list(re.finditer(strong_punct_pattern, text))
        if strong_matches:
            last_match = strong_matches[-1]
            end_index = last_match.end()
            chunk = text[:end_index].strip()
            remainder = text[end_index:].strip()
            return chunk, remainder if remainder else None
        
        # 2. Weak punctuation (send if enough words)
        weak_punct_pattern = r"([,:;])\s+"
        weak_matches = list(re.finditer(weak_punct_pattern, text))
        if weak_matches and len(words) >= self.min_chunk_words * 1.5:
            last_match = weak_matches[-1]
            end_index = last_match.end()
            chunk = text[:end_index].strip()
            remainder = text[end_index:].strip()
            return chunk, remainder if remainder else None
        
        # 3. Natural break points (conjunctions, prepositions)
        break_words = [" and ", " but ", " or ", " so ", " then ", " when ", " where ", " while ", " because "]
        for break_word in break_words:
            if break_word in text and len(words) >= self.min_chunk_words * 2:
                # Find the last occurrence of break word
                last_pos = text.rfind(break_word)
                if last_pos > len(text) * 0.3:  # Don't break too early
                    chunk = text[:last_pos + len(break_word)].strip()
                    remainder = text[last_pos + len(break_word):].strip()
                    return chunk, remainder if remainder else None
        
        # 4. Long text fallback (prevent infinite waiting)
        if len(words) >= self.min_chunk_words * 3:
            # Find a good word boundary around the middle
            mid_point = len(text) // 2
            space_pos = text.find(" ", mid_point)
            if space_pos != -1:
                chunk = text[:space_pos].strip()
                remainder = text[space_pos:].strip()
                return chunk, remainder if remainder else None
        
        return None, None

    @observe_voice_assistant("optimized_text_to_speech")
    async def _fast_synth_and_send(self, text: str):
        """
        Ultra-fast synthesis and sending with direct streaming.
        No intermediate queues - direct pipeline to output.
        """
        if not text.strip():
            return

        # Create a synthesis task that streams directly to output
        async def synthesis_task():
            try:
                self.is_speaking = True
                async for audio_chunk in self.tts.synthesize(text):
                    await self.output_channel.send_audio(audio_chunk)
            except Exception as e:
                logger.error(f"Error during fast synthesis: {e}")
            finally:
                self.is_speaking = False

        # Track the task for potential cancellation
        task = asyncio.create_task(synthesis_task())
        self.active_synthesis_tasks.add(task)
        
        # Clean up completed tasks
        task.add_done_callback(lambda t: self.active_synthesis_tasks.discard(t))

    async def stop(self):
        """Stop the optimized voice assistant and clean up resources."""
        # Cancel all active synthesis tasks
        await self._cancel_active_synthesis()
        
        # Cancel the brain task
        if self.brain_task and not self.brain_task.done():
            self.brain_task.cancel()
            try:
                await self.brain_task
            except asyncio.CancelledError:
                logger.info("Brain task cancelled during shutdown")

    def set_performance_mode(self, mode: str):
        """
        Set predefined performance modes for different use cases.
        
        Args:
            mode: 'fastest', 'balanced', 'quality'
        """
        if mode == 'fastest':
            self.min_chunk_words = 2
            self.chunk_timeout_ms = 100
            self.enable_word_level_streaming = False  # Disabled - causes chunky audio
            self.enable_parallel_processing = True
        elif mode == 'balanced':
            self.min_chunk_words = 3
            self.chunk_timeout_ms = 150
            self.enable_word_level_streaming = False
            self.enable_parallel_processing = True
        elif mode == 'quality':
            self.min_chunk_words = 5
            self.chunk_timeout_ms = 300
            self.enable_word_level_streaming = False
            self.enable_parallel_processing = False
        else:
            raise ValueError("Mode must be 'fastest', 'balanced', or 'quality'")
        
        logger.info(f"Performance mode set to: {mode}")
