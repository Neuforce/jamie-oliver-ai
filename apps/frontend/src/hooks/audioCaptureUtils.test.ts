import { describe, expect, it } from 'vitest';
import {
  AUDIO_CAPTURE_CHUNK_SIZE,
  Float32ChunkAccumulator,
  float32ToPcm16,
  getMaxAmplitude,
  pcm16ToBase64,
  resolveAudioCaptureMode,
  selectAudioCaptureEngine,
} from './audioCaptureUtils';

describe('audioCaptureUtils', () => {
  it('normalizes invalid capture modes to auto', () => {
    expect(resolveAudioCaptureMode(undefined)).toBe('auto');
    expect(resolveAudioCaptureMode('invalid')).toBe('auto');
    expect(resolveAudioCaptureMode('worklet')).toBe('worklet');
    expect(resolveAudioCaptureMode('legacy')).toBe('legacy');
  });

  it('selects the right engine for rollout and fallback cases', () => {
    expect(selectAudioCaptureEngine('auto', true)).toBe('worklet');
    expect(selectAudioCaptureEngine('auto', false)).toBe('legacy');
    expect(selectAudioCaptureEngine('worklet', false)).toBe('legacy');
    expect(selectAudioCaptureEngine('legacy', true)).toBe('legacy');
  });

  it('measures amplitude without allocating intermediate arrays', () => {
    const input = new Float32Array([0, -0.25, 0.7, -0.1]);
    expect(getMaxAmplitude(input)).toBeCloseTo(0.7);
  });

  it('converts float32 audio samples to pcm16 with clipping', () => {
    const pcm = float32ToPcm16(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]));
    expect(Array.from(pcm)).toEqual([-32768, -32768, -16384, 0, 16383, 32767, 32767]);
  });

  it('encodes pcm16 payloads as base64', () => {
    const pcm = new Int16Array([1, 256, -32768]);
    expect(pcm16ToBase64(pcm)).toBe('AQAAAQCA');
  });

  it('batches float32 frames into stable chunk sizes', () => {
    const accumulator = new Float32ChunkAccumulator(4);
    const chunks: number[][] = [];

    accumulator.push(new Float32Array([1, 2, 3]), (chunk) => {
      chunks.push(Array.from(chunk));
    });
    expect(chunks).toEqual([]);

    accumulator.push(new Float32Array([4, 5, 6, 7, 8]), (chunk) => {
      chunks.push(Array.from(chunk));
    });

    expect(chunks).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
  });

  it('uses the production chunk size constant expected by the websocket backend', () => {
    expect(AUDIO_CAPTURE_CHUNK_SIZE).toBe(4096);
  });
});
