import type { AudioChunkMetadata } from './audioCaptureUtils';

export type VoiceTurnState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'processing'
  | 'assistant_speaking'
  | 'barge_in_pending';

export interface BufferedAudioChunk {
  base64Audio: string;
  metadata: AudioChunkMetadata;
}

export interface VoiceBargeInConfig {
  averageAmplitudeThreshold: number;
  maxAmplitudeThreshold: number;
  highConfidenceMaxAmplitude: number;
  requiredConsecutiveSpeechChunks: number;
  maxBufferedChunks: number;
  assistantSpeechGracePeriodMs: number;
}

export const DEFAULT_VOICE_BARGE_IN_CONFIG: VoiceBargeInConfig = {
  averageAmplitudeThreshold: 0.03,
  maxAmplitudeThreshold: 0.18,
  highConfidenceMaxAmplitude: 0.45,
  requiredConsecutiveSpeechChunks: 4,
  maxBufferedChunks: 6,
  assistantSpeechGracePeriodMs: 1200,
};

export function isAssistantBusy(state: VoiceTurnState, isAudioPlaying: boolean): boolean {
  return state === 'processing' || state === 'assistant_speaking' || state === 'barge_in_pending' || isAudioPlaying;
}

export function appendBufferedAudioChunk(
  chunks: BufferedAudioChunk[],
  nextChunk: BufferedAudioChunk,
  maxBufferedChunks: number
): BufferedAudioChunk[] {
  const nextChunks = [...chunks, nextChunk];
  if (nextChunks.length <= maxBufferedChunks) {
    return nextChunks;
  }

  return nextChunks.slice(nextChunks.length - maxBufferedChunks);
}

export function isSpeechLikeChunk(
  metadata: AudioChunkMetadata,
  config: VoiceBargeInConfig = DEFAULT_VOICE_BARGE_IN_CONFIG
): boolean {
  return (
    metadata.averageAmplitude >= config.averageAmplitudeThreshold &&
    metadata.maxAmplitude >= config.maxAmplitudeThreshold
  );
}

export function shouldTriggerBargeIn(
  chunks: BufferedAudioChunk[],
  config: VoiceBargeInConfig = DEFAULT_VOICE_BARGE_IN_CONFIG
): boolean {
  if (chunks.length === 0) {
    return false;
  }

  const latestChunk = chunks[chunks.length - 1];
  if (latestChunk.metadata.maxAmplitude >= config.highConfidenceMaxAmplitude) {
    return true;
  }

  if (chunks.length < config.requiredConsecutiveSpeechChunks) {
    return false;
  }

  const recentChunks = chunks.slice(-config.requiredConsecutiveSpeechChunks);
  return recentChunks.every((chunk) => isSpeechLikeChunk(chunk.metadata, config));
}
