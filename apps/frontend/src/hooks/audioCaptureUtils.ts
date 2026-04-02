export const AUDIO_CAPTURE_CHUNK_SIZE = 4096;
export const AUDIO_CAPTURE_SILENCE_THRESHOLD = 0.001;

export type AudioCaptureMode = 'auto' | 'worklet' | 'legacy';
export type AudioCaptureEngine = 'worklet' | 'legacy';

export interface AudioChunkMetadata {
  maxAmplitude: number;
  averageAmplitude: number;
  frameCount: number;
  sampleRate: number;
  engine: AudioCaptureEngine;
}

export function resolveAudioCaptureMode(rawMode?: string): AudioCaptureMode {
  if (rawMode === 'worklet' || rawMode === 'legacy' || rawMode === 'auto') {
    return rawMode;
  }

  return 'auto';
}

export function selectAudioCaptureEngine(
  mode: AudioCaptureMode,
  hasAudioWorklet: boolean
): AudioCaptureEngine {
  if (mode === 'legacy') {
    return 'legacy';
  }

  if (mode === 'worklet' && hasAudioWorklet) {
    return 'worklet';
  }

  return hasAudioWorklet ? 'worklet' : 'legacy';
}

export function getMaxAmplitude(inputData: Float32Array): number {
  let maxAmplitude = 0;

  for (let i = 0; i < inputData.length; i++) {
    const amplitude = Math.abs(inputData[i]);
    if (amplitude > maxAmplitude) {
      maxAmplitude = amplitude;
    }
  }

  return maxAmplitude;
}

export function getAverageAmplitude(inputData: Float32Array): number {
  if (inputData.length === 0) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < inputData.length; i++) {
    total += Math.abs(inputData[i]);
  }

  return total / inputData.length;
}

export function float32ToPcm16(inputData: Float32Array): Int16Array {
  const pcmData = new Int16Array(inputData.length);

  for (let i = 0; i < inputData.length; i++) {
    const sample = Math.max(-1, Math.min(1, inputData[i]));
    pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return pcmData;
}

export function pcm16ToBase64(pcmData: Int16Array): string {
  const bytes = new Uint8Array(pcmData.buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let chunkBinary = '';

    for (let j = 0; j < chunk.length; j++) {
      chunkBinary += String.fromCharCode(chunk[j]);
    }

    binary += chunkBinary;
  }

  return btoa(binary);
}

export class Float32ChunkAccumulator {
  private readonly targetFrames: number;
  private bufferedFrames = 0;
  private buffer: Float32Array;

  constructor(targetFrames = AUDIO_CAPTURE_CHUNK_SIZE) {
    this.targetFrames = targetFrames;
    this.buffer = new Float32Array(targetFrames);
  }

  push(inputData: Float32Array, onChunk: (chunk: Float32Array) => void) {
    let readOffset = 0;

    while (readOffset < inputData.length) {
      const remainingCapacity = this.targetFrames - this.bufferedFrames;
      const framesToCopy = Math.min(remainingCapacity, inputData.length - readOffset);

      this.buffer.set(inputData.subarray(readOffset, readOffset + framesToCopy), this.bufferedFrames);
      this.bufferedFrames += framesToCopy;
      readOffset += framesToCopy;

      if (this.bufferedFrames === this.targetFrames) {
        onChunk(this.buffer.slice());
        this.bufferedFrames = 0;
      }
    }
  }

  reset() {
    this.bufferedFrames = 0;
    this.buffer = new Float32Array(this.targetFrames);
  }
}
