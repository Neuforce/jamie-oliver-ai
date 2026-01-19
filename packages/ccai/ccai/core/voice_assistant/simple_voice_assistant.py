import asyncio
import re
import time
from typing import Tuple, Optional, Dict, Any
from collections import deque

from ccai.core.brain.base import BaseBrain
from ccai.core.logger import configure_logger
from ccai.core.messages.base import UserMessage
from ccai.core.speech_to_text.base import BaseSpeechToText
from ccai.core.text_to_speech.base import BaseTextToSpeech
from ccai.core.tracing import observe_voice_assistant, tracer
from ccai.core import context_variables
from ccai.core.llm.base import ChunkResponse, FunctionCallResponse
from .base import BaseVoiceAssistant

logger = configure_logger(__name__)


class SimpleVoiceAssistant(BaseVoiceAssistant):
    """
    A simple voice assistant that processes transcriptions from speech-to-text (STT),
    uses a brain component to generate responses, and outputs speech via text-to-speech (TTS).
    Implements a non-blocking TTS output system using asyncio queues.
    """

    def __init__(
        self,
        stt: BaseSpeechToText,
        brain: BaseBrain,
        tts: BaseTextToSpeech,
        input_channel,
        output_channel,
    ):
        """
        Initialize the SimpleVoiceAssistant.

        Args:
            stt (BaseSpeechToText): The speech-to-text component.
            brain (BaseBrain): The brain component for processing messages.
            tts (BaseTextToSpeech): The text-to-speech component.
            input_channel: The input channel for receiving audio data.
            output_channel: The output channel for sending audio data.
        """
        self.stt = stt
        self.brain = brain
        self.tts = tts
        self.input_channel = input_channel
        self.output_channel = output_channel

        # Use a brain request queue instead of direct task management
        self.brain_queue = asyncio.Queue()
        self.brain_task = None
        self.brain_processing = False
        self.current_transcription = None

        # Audio output queue and processing task
        self.audio_queue = asyncio.Queue()
        self.output_task = None
        self.is_speaking = False

        # System message queue for events from recipe engine, timers, etc.
        self.system_message_queue = asyncio.Queue()
        self.system_message_task = None

    async def start(self, hello_message: Optional[str] = None):
        """
        Start the voice assistant.

        This method starts the output processor task, sends an initial greeting,
        then listens for transcriptions from the STT component,
        processes them with the brain, and queues speech output via TTS.
        """
        # Start the output processor task
        self.output_task = asyncio.create_task(self._process_output_queue())

        # Start the brain processor task
        self.brain_task = asyncio.create_task(self._process_brain_queue())

        # Start the system message processor task
        self.system_message_task = asyncio.create_task(self._process_system_message_queue())

        # Queue the initial greeting (non-blocking)
        if hello_message:
            self.brain.chat_memory.add_assistant_message(content=hello_message)
            await self.synth_and_send(hello_message)

        async for transcription in self.stt.transcribe(self.input_channel):
            # Interrupt any ongoing speech output if there's new input
            if transcription.content:
                logger.info("Interrupting current output")
                await self.output_channel.clear()
                # Clear the audio queue
                self._clear_audio_queue()
                self.is_speaking = False

                # Update the current transcription to the latest one
                self.current_transcription = transcription.content

            logger.debug(f"Received transcription: {transcription}")

            # Add final transcriptions to the brain queue for processing
            if transcription.is_final:
                # Send the transcription to the brain queue
                await self.brain_queue.put(transcription.content)

    def _clear_audio_queue(self):
        """Clear all pending items from the audio queue."""
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
                self.audio_queue.task_done()
            except asyncio.QueueEmpty:
                break

    async def _process_output_queue(self):
        """
        Process the audio output queue continuously.
        This task runs in the background to send audio chunks to the output channel.
        """
        while True:
            try:
                audio_item = await self.audio_queue.get()

                # Check if it's a special command
                if (
                    isinstance(audio_item, dict)
                    and audio_item.get("command") == "synthesize"
                ):
                    # Process TTS synthesis request
                    text = audio_item.get("text", "")
                    # When processing a "synthesize" command
                    if text:
                        self.is_speaking = True
                        try:
                            async for audio_chunk in self.tts.synthesize(text):
                                # Send audio chunk directly to output instead of requeuing
                                await self.output_channel.send_audio(audio_chunk)
                        except Exception as e:
                            logger.error(f"Error during synthesis: {e}", exc_info=True)
                        finally:
                            self.is_speaking = False
                else:
                    # It's an audio chunk, send it directly
                    try:
                        await self.output_channel.send_audio(audio_item)
                    except Exception as e:
                        logger.error(f"Error sending audio to output channel: {e}")

                # Mark task as done
                self.audio_queue.task_done()

            except asyncio.CancelledError:
                logger.info("Output queue processor was cancelled")
                break
            except Exception as e:
                logger.error(f"Error in output queue processor: {e}")

    async def _process_brain_queue(self):
        """
        Process the brain queue continuously.
        This task runs in the background to handle brain processing requests.
        """
        while True:
            try:
                # Wait for the next transcription in the queue
                transcription = await self.brain_queue.get()

                # Set processing flag to true
                self.brain_processing = True

                try:
                    # Handle the transcription
                    await self.brain_process(transcription)
                except asyncio.CancelledError:
                    # This should not happen as we're not cancelling this task
                    logger.warning("Brain queue processor was unexpectedly cancelled")
                    raise
                except Exception as e:
                    logger.error(f"Error in brain processing: {e}", exc_info=True)
                finally:
                    # Mark task as done and reset processing flag
                    self.brain_queue.task_done()
                    self.brain_processing = False

            except asyncio.CancelledError:
                logger.info("Brain queue processor was cancelled")
                break
            except Exception as e:
                logger.error(f"Error in brain queue processor: {e}")
                # Brief pause to prevent tight error loops
                await asyncio.sleep(0.1)

    async def _process_system_message_queue(self):
        """
        Process the system message queue continuously.
        System messages are injected as if they come from the system (e.g., timer completions).
        """
        while True:
            try:
                # Wait for the next system message
                system_message = await self.system_message_queue.get()

                logger.info(f"Processing system message: {system_message}")

                try:
                    # Inject the system message as a UserMessage to the brain
                    # This allows the assistant to respond to system events
                    await self.brain_process(system_message, is_system_message=True)
                except Exception as e:
                    logger.error(f"Error processing system message: {e}", exc_info=True)
                finally:
                    self.system_message_queue.task_done()

            except asyncio.CancelledError:
                logger.info("System message queue processor was cancelled")
                break
            except Exception as e:
                logger.error(f"Error in system message queue processor: {e}")
                await asyncio.sleep(0.1)

    async def inject_system_message(self, message: str):
        """
        Inject a system message into the conversation.
        This can be called externally to notify the user about events.

        Args:
            message: The system message to inject
        """
        logger.info(f"💉 inject_system_message called with: {message}")
        await self.system_message_queue.put(message)
        logger.info(f"✅ System message added to queue, queue size: {self.system_message_queue.qsize()}")

    async def brain_process(self, transcription: str, is_system_message: bool = False):
        """
        Process a transcription with the brain and synthesize the response.

        Args:
            transcription (str): The transcription text to process.
            is_system_message (bool): Whether this is a system message (e.g., from recipe engine)
        """
        # Use a manual span for each conversation turn to capture input/output properly
        from langfuse import get_client
        langfuse = get_client()

        if not langfuse:
            # Fallback if no langfuse client available
            return await self._brain_process_internal(transcription, is_system_message)

        # Create a NEW TRACE for this specific conversation turn so it shows up in Sessions
        # even while the root conversation span is active.
        from langfuse import Langfuse
        new_trace_id = Langfuse.create_trace_id()
        message_type = "system_message" if is_system_message else "conversation_turn"
        with langfuse.start_as_current_span(
            name=message_type,
            trace_context={"trace_id": new_trace_id}
        ) as turn_span:
            try:
                # Ensure session context is inherited
                session_id = context_variables.get("session_id")
                user_id = context_variables.get("user_id")

                # Attach session/user context and the user input at TRACE level so it appears in Sessions
                turn_span.update_trace(
                    session_id=session_id,
                    user_id=user_id,
                    input=transcription,
                    tags=[message_type, "ccai"]
                )

                # Process the conversation turn
                full_content = await self._brain_process_internal(transcription, is_system_message)

                # Update TRACE output so the Sessions view shows this assistant reply
                turn_span.update_trace(output=full_content)

                return full_content

            except Exception as e:
                turn_span.update(
                    output={"error": str(e)},
                    level="ERROR"
                )
                raise

    async def _brain_process_internal(self, transcription: str, is_system_message: bool = False):
        """
        Internal brain processing logic separated for better tracing.

        Args:
            transcription: The text to process
            is_system_message: If True, format as a system notification to the assistant
        """
        start = time.perf_counter()
        first_chunk = True
        full_content = ""
        try:
            start = time.perf_counter()
            counter = 0

            # Format system messages differently so the assistant knows it's from the system
            if is_system_message:
                message_content = f"[SYSTEM NOTIFICATION] {transcription}"
            else:
                message_content = transcription

            response = self.brain.process(UserMessage(content=message_content))
            buffer = ""
            full_content = ""

            async for event in response:
                if counter == 0:
                    inference_time = time.perf_counter() - start
                    logger.info(
                        f"{self.__class__.__name__} time to first chunk event: {inference_time}"
                    )
                    counter += 1

                # Only process content from ChunkResponse events
                # FunctionCallResponse events don't have content
                if isinstance(event, ChunkResponse):
                    buffer += event.content
                    full_content += event.content
                elif isinstance(event, FunctionCallResponse):
                    # Function calls are handled by the brain, skip them here
                    logger.debug(f"Skipping FunctionCallResponse: {event.function_name}")
                    continue

                sentence, remainder = self.contains_punctuation(buffer)
                if sentence:
                    # Queue the sentence for synthesis (non-blocking)
                    await self.synth_and_send(sentence)

                    if first_chunk:
                        first_chunk = False
                        logger.info(
                            f"Brain Process - Time to first answer event: {time.perf_counter() - start}. Text: {sentence}"
                        )

                    buffer = remainder or ""

            # Queue any remaining text for synthesis
            if buffer:
                await self.synth_and_send(buffer)

            return full_content

        except asyncio.CancelledError:
            logger.info("Brain processing was cancelled")
            self.brain.chat_memory.add_assistant_message(content=full_content)
            raise  # Re-raise the exception to allow proper cancellation
        except Exception as e:
            logger.error(f"Error during brain processing: {e}")
            raise

    @observe_voice_assistant("text_to_speech")
    async def synth_and_send(self, text: str):
        """
        Queue text for synthesis and output.
        This method is non-blocking as it only adds a task to the queue.

        Args:
            text (str): The text to synthesize.
        """
        if not text:
            return

        # Add a synthesis command to the queue
        await self.audio_queue.put({"command": "synthesize", "text": text})

    @staticmethod
    def contains_punctuation(sentence: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Check if the sentence contains punctuation and split it.

        Args:
            sentence (str): The sentence to check.

        Returns:
            Tuple[Optional[str], Optional[str]]:
                A tuple containing the sentence up to and including the last punctuation mark
                and the remainder of the sentence. Returns (None, None) if no suitable punctuation is found.
        """
        punctuation_pattern = r"([.,;:?!])([ \n]|$)"
        matches = list(re.finditer(punctuation_pattern, sentence))
        if matches and len(sentence.split()) > 8:
            last_match = matches[-1]
            end_index = last_match.end()
            sentence_with_punctuation = sentence[:end_index].strip()
            remainder = sentence[end_index:].strip()
            return sentence_with_punctuation, remainder if remainder else None
        else:
            return None, None

    async def stop(self):
        """
        Stop the voice assistant and clean up resources.
        """
        # Cancel the output queue processor task
        if self.output_task and not self.output_task.done():
            self.output_task.cancel()
            try:
                await self.output_task
            except asyncio.CancelledError:
                logger.info("Output task cancelled during shutdown")

        # Cancel the brain queue processor task
        if self.brain_task and not self.brain_task.done():
            self.brain_task.cancel()
            try:
                await self.brain_task
            except asyncio.CancelledError:
                logger.info("Brain task cancelled during shutdown")

        # Cancel the system message processor task
        if self.system_message_task and not self.system_message_task.done():
            self.system_message_task.cancel()
            try:
                await self.system_message_task
            except asyncio.CancelledError:
                logger.info("System message task cancelled during shutdown")

        # Clear any remaining items in the queue
        self._clear_audio_queue()
