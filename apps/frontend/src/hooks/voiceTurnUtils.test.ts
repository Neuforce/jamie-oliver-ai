import { describe, expect, it } from 'vitest';
import {
  appendBufferedAudioChunk,
  DEFAULT_VOICE_BARGE_IN_CONFIG,
  isAssistantBusy,
  isSpeechLikeChunk,
  shouldTriggerBargeIn,
  type BufferedAudioChunk,
} from './voiceTurnUtils';

function makeChunk(maxAmplitude: number, averageAmplitude: number): BufferedAudioChunk {
  return {
    base64Audio: 'chunk',
    metadata: {
      maxAmplitude,
      averageAmplitude,
      frameCount: 4096,
      sampleRate: 16000,
      engine: 'worklet',
    },
  };
}

describe('voiceTurnUtils', () => {
  it('identifies assistant-busy states correctly', () => {
    expect(isAssistantBusy('processing', false)).toBe(true);
    expect(isAssistantBusy('assistant_speaking', false)).toBe(true);
    expect(isAssistantBusy('listening', true)).toBe(true);
    expect(isAssistantBusy('listening', false)).toBe(false);
  });

  it('keeps only the most recent buffered chunks', () => {
    const maxChunks = 2;
    const first = makeChunk(0.01, 0.005);
    const second = makeChunk(0.02, 0.006);
    const third = makeChunk(0.03, 0.007);

    const buffered = appendBufferedAudioChunk(
      appendBufferedAudioChunk(
        appendBufferedAudioChunk([], first, maxChunks),
        second,
        maxChunks
      ),
      third,
      maxChunks
    );

    expect(buffered).toEqual([second, third]);
  });

  it('requires both average and peak energy for speech-like chunks', () => {
    expect(isSpeechLikeChunk(makeChunk(0.22, 0.04).metadata)).toBe(true);
    expect(isSpeechLikeChunk(makeChunk(0.09, 0.005).metadata)).toBe(false);
    expect(isSpeechLikeChunk(makeChunk(0.03, 0.03).metadata)).toBe(false);
  });

  it('triggers barge-in after consecutive speech-like chunks', () => {
    const chunks = [
      makeChunk(0.22, 0.04),
      makeChunk(0.23, 0.041),
      makeChunk(0.24, 0.042),
      makeChunk(0.25, 0.043),
    ];

    expect(shouldTriggerBargeIn(chunks)).toBe(true);
  });

  it('triggers barge-in immediately on very strong onset', () => {
    expect(shouldTriggerBargeIn([makeChunk(0.46, 0.05)])).toBe(true);
  });

  it('does not trigger on weak leakage-like chunks', () => {
    const chunks = [
      makeChunk(0.04, 0.004),
      makeChunk(0.05, 0.006),
      makeChunk(0.06, 0.007),
    ];

    expect(shouldTriggerBargeIn(chunks, DEFAULT_VOICE_BARGE_IN_CONFIG)).toBe(false);
  });
});
