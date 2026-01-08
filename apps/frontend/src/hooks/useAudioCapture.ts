import { useRef, useCallback } from 'react';

export interface UseAudioCaptureOptions {
  sampleRate?: number;
  onAudioData?: (base64Audio: string) => void;
}

export function useAudioCapture(options: UseAudioCaptureOptions = {}) {
  const { sampleRate = 16000, onAudioData } = options;
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const isMutedRef = useRef(false);

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate });
      audioContextRef.current = audioContext;

      // Resume AudioContext if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let audioChunkCount = 0;
      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !onAudioData) {
          if (isMutedRef.current && audioChunkCount % 100 === 0) {
            // Log muted status occasionally to avoid spam
            console.log('🔇 Audio capture muted, skipping chunk');
          }
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Check if there's actual audio input (not silence)
        const maxAmplitude = Math.max(...Array.from(inputData).map(Math.abs));
        if (maxAmplitude < 0.001) {
          // Very quiet, likely silence - don't log every time
          if (audioChunkCount % 200 === 0) {
            console.log('🔇 Very quiet audio detected (likely silence)');
          }
        } else {
          // Log occasionally when we detect actual audio
          if (audioChunkCount % 100 === 0) {
            console.log('🎤 Audio captured, amplitude:', maxAmplitude.toFixed(4));
          }
        }
        
        const pcmData = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        audioChunkCount++;
        onAudioData(base64);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      return true;
    } catch (err) {
      console.error('Error starting audio capture:', err);
      throw err;
    }
  }, [sampleRate, onAudioData]);

  const stopCapture = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
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
