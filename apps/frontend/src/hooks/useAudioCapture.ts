import { useRef, useCallback } from 'react';
import audioCaptureProcessorUrl from '../worklets/audioCaptureProcessor.ts?url';
import {
  AUDIO_CAPTURE_SILENCE_THRESHOLD,
  getAverageAmplitude,
  float32ToPcm16,
  getMaxAmplitude,
  pcm16ToBase64,
  resolveAudioCaptureMode,
  selectAudioCaptureEngine,
  type AudioChunkMetadata,
  type AudioCaptureEngine,
} from './audioCaptureUtils';

export interface UseAudioCaptureOptions {
  sampleRate?: number;
  onAudioData?: (base64Audio: string, metadata: AudioChunkMetadata) => void;
}

type AudioCaptureNode = ScriptProcessorNode | AudioWorkletNode;

const AUDIO_CAPTURE_PROCESSOR_NAME = 'audio-capture-processor';

function isAudioWorkletNode(node: AudioCaptureNode | null): node is AudioWorkletNode {
  return typeof AudioWorkletNode !== 'undefined' && node instanceof AudioWorkletNode;
}

export function useAudioCapture(options: UseAudioCaptureOptions = {}) {
  const { sampleRate = 16000, onAudioData } = options;
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // When the caller provides a shared context, we must not close it on cleanup.
  const ownsAudioContextRef = useRef(true);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<AudioCaptureNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const isMutedRef = useRef(false);
  const engineRef = useRef<AudioCaptureEngine>('legacy');

  const handleAudioChunk = useCallback(
    (inputData: Float32Array, audioChunkCount: number) => {
      if (isMutedRef.current || !onAudioData) {
        if (isMutedRef.current && audioChunkCount % 100 === 0) {
          console.log('🔇 Audio capture muted, skipping chunk');
        }
        return;
      }

      const maxAmplitude = getMaxAmplitude(inputData);
      const averageAmplitude = getAverageAmplitude(inputData);
      if (maxAmplitude < AUDIO_CAPTURE_SILENCE_THRESHOLD) {
        if (audioChunkCount % 200 === 0) {
          console.log('🔇 Very quiet audio detected (likely silence)');
        }
      } else if (audioChunkCount % 100 === 0) {
        console.log('🎤 Audio captured, amplitude:', maxAmplitude.toFixed(4));
      }

      const pcmData = float32ToPcm16(inputData);
      onAudioData(pcm16ToBase64(pcmData), {
        maxAmplitude,
        averageAmplitude,
        frameCount: inputData.length,
        sampleRate,
        engine: engineRef.current,
      });
    },
    [onAudioData]
  );

  const startCapture = useCallback(async (externalAudioContext?: AudioContext | null) => {
    try {
      if (audioContextRef.current || mediaStreamRef.current) {
        return true;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;

      let audioContext: AudioContext;
      if (externalAudioContext) {
        // Reuse the caller's context — avoids running two audio threads at the
        // same sample rate, which causes subtle interference / static on some
        // devices (the OS audio mixer sees two independent 16 kHz graphs).
        audioContext = externalAudioContext;
        ownsAudioContextRef.current = false;
      } else {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioContextClass({ sampleRate });
        ownsAudioContextRef.current = true;
      }
      audioContextRef.current = audioContext;

      // Resume AudioContext if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      // Route the capture graph to a MediaStreamDestination (a silent stream)
      // rather than the speaker output.  This keeps the AudioWorklet / ScriptProcessor
      // graph alive (Web Audio only processes nodes connected to a destination) while
      // ensuring zero mic audio reaches the physical speakers.  Using the main
      // audioContext.destination here caused the OS to assign the two AudioContexts
      // (capture + playback) to separate stereo channels, producing mono voice on
      // one ear and mic noise on the other.
      const silentDestination = audioContext.createMediaStreamDestination();
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      sourceNodeRef.current = source;
      silentGainRef.current = silentGain;

      const mode = resolveAudioCaptureMode(import.meta.env.VITE_AUDIO_CAPTURE_ENGINE);
      const preferredEngine = selectAudioCaptureEngine(mode, !!audioContext.audioWorklet);
      let audioChunkCount = 0;

      let processor: AudioCaptureNode;
      if (preferredEngine === 'worklet') {
        try {
          await audioContext.audioWorklet.addModule(audioCaptureProcessorUrl);
          const workletNode = new AudioWorkletNode(audioContext, AUDIO_CAPTURE_PROCESSOR_NAME, {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
            outputChannelCount: [1],
          });
          workletNode.port.onmessage = (event: MessageEvent<{ type?: string; payload?: ArrayBuffer }>) => {
            if (event.data?.type !== 'audio-chunk' || !event.data.payload) {
              return;
            }

            audioChunkCount++;
            handleAudioChunk(new Float32Array(event.data.payload), audioChunkCount);
          };
          processor = workletNode;
          engineRef.current = 'worklet';
          console.log('[useAudioCapture] Using AudioWorklet microphone capture');
        } catch (error) {
          console.warn('[useAudioCapture] AudioWorklet unavailable, falling back to ScriptProcessorNode', error);
          processor = audioContext.createScriptProcessor(4096, 1, 1);
          engineRef.current = 'legacy';
        }
      } else {
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        engineRef.current = 'legacy';
      }

      if (isAudioWorkletNode(processor)) {
        source.connect(processor);
        processor.connect(silentGain);
      } else {
        processor.onaudioprocess = (e) => {
          audioChunkCount++;
          handleAudioChunk(e.inputBuffer.getChannelData(0), audioChunkCount);
        };
        source.connect(processor);
        processor.connect(silentGain);
        console.log('[useAudioCapture] Using ScriptProcessorNode microphone capture');
      }

      processorRef.current = processor;
      silentGain.connect(silentDestination);

      return true;
    } catch (err) {
      console.error('Error starting audio capture:', err);
      throw err;
    }
  }, [sampleRate, onAudioData]);

  const stopCapture = useCallback(() => {
    if (processorRef.current) {
      if (isAudioWorkletNode(processorRef.current)) {
        processorRef.current.port.onmessage = null;
      }
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && ownsAudioContextRef.current) {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    ownsAudioContextRef.current = true;

    engineRef.current = 'legacy';
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    isMutedRef.current = muted;
  }, []);

  return {
    startCapture,
    stopCapture,
    setMuted,
  };
}
