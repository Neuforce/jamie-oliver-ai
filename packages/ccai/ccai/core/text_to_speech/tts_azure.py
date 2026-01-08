
from typing import AsyncGenerator
from .base import BaseTextToSpeech


class AzureTTSService(BaseTextToSpeech):
    def __init__(
        self,
        subscription_key: str,
        region: str,
        voice_name: str = "es-ES-XimenaMultilingualNeural",
        language: str = "es-ES",
        output_format: speechsdk.SpeechSynthesisOutputFormat = speechsdk.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw,
        speaking_rate: float = 1.2,
    ):
        try:
            import azure.cognitiveservices.speech as speechsdk
        except ImportError:
            raise ImportError("azure-cognitiveservices-speech is not installed. Please install it with 'pip install azure-cognitiveservices-speech'.")

        self.subscription_key = subscription_key
        self.region = region
        self.voice_name = voice_name
        self.language = language
        self.output_format = output_format
        self.speaking_rate = speaking_rate
        self.speech_config = None
        self.speech_synthesizer = None
        self._initialize_client()

    def _initialize_client(self):
        if not self.speech_config:
            self.speech_config = speechsdk.SpeechConfig(
                subscription=self.subscription_key, region=self.region
            )
            self.speech_config.set_speech_synthesis_output_format(self.output_format)
            self.speech_config.speech_synthesis_voice_name = self.voice_name
            self.speech_synthesizer = speechsdk.SpeechSynthesizer(
                speech_config=self.speech_config, audio_config=None
            )

    async def synthesize(self, text: str) -> AsyncGenerator[bytes, None]:
        ssml = f"""
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{self.language}">
            <voice name="{self.voice_name}">
                <prosody rate="{self.speaking_rate}">
                    {text}
                </prosody>
            </voice>
        </speak>
        """

        result = self.speech_synthesizer.speak_ssml_async(ssml).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            audio_data = result.audio_data
            chunk_size = 1024
            for i in range(0, len(audio_data), chunk_size):
                yield audio_data[i : i + chunk_size]
        else:
            print(f"Speech synthesis failed: {result.reason}")
            if result.reason == speechsdk.ResultReason.Canceled:
                cancellation_details = result.cancellation_details
                print(f"Speech synthesis canceled: {cancellation_details.reason}")
                if cancellation_details.reason == speechsdk.CancellationReason.Error:
                    print(f"Error details: {cancellation_details.error_details}")

    async def close(self):
        if self.speech_synthesizer:
            self.speech_synthesizer.stop_speaking_async()

    def set_speaking_rate(self, rate: float):
        """
        Set the speaking rate of the synthesized speech.
        :param rate: A value between 0.5 (half speed) and 2.0 (double speed).
        """
        if 0.5 <= rate <= 2.0:
            self.speaking_rate = rate
        else:
            raise ValueError("Speaking rate must be between 0.5 and 2.0")
