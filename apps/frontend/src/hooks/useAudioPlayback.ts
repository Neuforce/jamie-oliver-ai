import { useRef, useCallback } from 'react';

export function useAudioPlayback() {
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const leftoverByteRef = useRef<Uint8Array | null>(null);

  const initAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      console.log('AudioContext created, initial state:', audioContextRef.current.state);
    }
    
    // Always try to resume if suspended (required for autoplay policies)
    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        console.log('AudioContext resumed, new state:', audioContextRef.current.state);
      } catch (err) {
        console.error('Failed to resume AudioContext:', err);
      }
    }
    
    return audioContextRef.current;
  }, []);

  const playAudio = useCallback(async (base64Audio: string) => {
    try {
      console.log('🔊 playAudio called, initializing AudioContext...');
      const audioContext = await initAudioContext();
      if (!audioContext) {
        console.error('❌ AudioContext is null, cannot play audio');
        return;
      }
      
      console.log('✅ AudioContext state:', audioContext.state);
      if (audioContext.state === 'suspended') {
        console.log('⚠️ AudioContext is suspended, attempting to resume...');
        try {
          await audioContext.resume();
          console.log('✅ AudioContext resumed, new state:', audioContext.state);
        } catch (resumeErr) {
          console.error('❌ Failed to resume AudioContext:', resumeErr);
          return;
        }
      }

      // Decode base64 to ArrayBuffer (matching agent-v0 implementation)
      console.log('📦 Decoding base64 audio, length:', base64Audio.length);
      const binaryString = atob(base64Audio);
      const incoming = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        incoming[i] = binaryString.charCodeAt(i);
      }

      // Handle leftover bytes from previous chunk (for streaming audio)
      let bytes: Uint8Array;
      if (leftoverByteRef.current) {
        bytes = new Uint8Array(leftoverByteRef.current.length + incoming.length);
        bytes.set(leftoverByteRef.current, 0);
        bytes.set(incoming, leftoverByteRef.current.length);
        leftoverByteRef.current = null;
      } else {
        bytes = incoming;
      }

      // If odd number of bytes, save the last one for next chunk
      // (PCM 16-bit requires pairs of bytes)
      if (bytes.length % 2 === 1) {
        leftoverByteRef.current = bytes.slice(bytes.length - 1);
        bytes = bytes.slice(0, bytes.length - 1);
      }

      const numSamples = Math.floor(bytes.length / 2);
      if (numSamples === 0) {
        console.log('⚠️ No samples to play (odd number of bytes, waiting for next chunk)');
        return;
      }

      // Convert PCM 16-bit little-endian to Float32Array
      // Use DataView with little-endian (true) to match agent-v0
      const float32Array = new Float32Array(numSamples);
      const dataView = new DataView(bytes.buffer);
      for (let i = 0; i < numSamples; i++) {
        const int16 = dataView.getInt16(i * 2, true); // true = little-endian
        float32Array[i] = int16 / 32768.0;
      }

      console.log('🎵 Creating AudioBuffer, samples:', numSamples);
      // Create AudioBuffer
      const audioBuffer = audioContext.createBuffer(1, numSamples, 16000);
      audioBuffer.copyToChannel(float32Array, 0);

      // Create and schedule source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      const now = audioContext.currentTime;
      const startTime = Math.max(now, nextPlayTimeRef.current);
      console.log('▶️ Starting audio playback at:', startTime, 'duration:', audioBuffer.duration);
      source.start(startTime);

      // Update next play time
      nextPlayTimeRef.current = startTime + audioBuffer.duration;

      // Track source for cleanup
      audioQueueRef.current.push(source);

      source.onended = () => {
        console.log('✅ Audio playback finished');
        const index = audioQueueRef.current.indexOf(source);
        if (index > -1) {
          audioQueueRef.current.splice(index, 1);
        }
      };
      
      source.onerror = (err) => {
        console.error('❌ Audio source error:', err);
      };
    } catch (err) {
      console.error('❌ Error playing audio:', err);
    }
  }, [initAudioContext]);

  const stopAllAudio = useCallback(() => {
    audioQueueRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (err) {
        // Source may already be stopped
      }
    });
    audioQueueRef.current = [];
    nextPlayTimeRef.current = 0;
  }, []);

  const cleanup = useCallback(() => {
    stopAllAudio();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [stopAllAudio]);

  return {
    playAudio,
    stopAllAudio,
    cleanup,
    initAudioContext,
  };
}
