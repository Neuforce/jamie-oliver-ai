export type VoiceBubbleMessage = {
  id: string;
  content: string;
  isStreaming?: boolean;
  voiceResponseId?: string;
};

/** Whether a streaming Jamie bubble should be finalized for this turn signal. */
export function shouldFinalizeVoiceBubble(
  message: VoiceBubbleMessage,
  options: {
    responseId?: string;
    currentMessageId?: string | null;
  },
): boolean {
  if (!message.isStreaming) return false;

  const { responseId, currentMessageId } = options;
  if (responseId && message.voiceResponseId === responseId) return true;
  if (!responseId && currentMessageId && message.id === currentMessageId) return true;
  if (responseId && !message.voiceResponseId && currentMessageId && message.id === currentMessageId) {
    return true;
  }
  return false;
}

export function finalizeVoiceBubbleMessages(
  messages: VoiceBubbleMessage[],
  options: {
    responseId?: string;
    currentMessageId?: string | null;
    accumulatedText?: string;
  },
): { messages: VoiceBubbleMessage[]; finalizedCurrentMessage: boolean } {
  const { responseId, currentMessageId, accumulatedText = '' } = options;
  let finalizedCurrentMessage = false;

  const next = messages.map(message => {
    if (!shouldFinalizeVoiceBubble(message, { responseId, currentMessageId })) {
      return message;
    }

    if (currentMessageId && message.id === currentMessageId) {
      finalizedCurrentMessage = true;
    }

    const fallbackText = currentMessageId && message.id === currentMessageId ? accumulatedText : '';
    const content = (message.content || fallbackText || '').trim();
    return { ...message, content, isStreaming: false };
  });

  return { messages: next, finalizedCurrentMessage };
}

export type VoiceTurnDoneAction =
  | { type: 'defer'; responseId?: string }
  | { type: 'finalize_now'; responseId?: string };

/** Decide how a backend `done` event should finalize the in-flight voice turn. */
export function resolveVoiceDoneAction(
  responseId: string | undefined,
  activeResponseId: string | null,
  isAudioPlaying: boolean,
): VoiceTurnDoneAction {
  const finalizeResponseId = responseId ?? activeResponseId ?? undefined;
  if (isAudioPlaying) {
    return { type: 'defer', responseId: finalizeResponseId };
  }
  return { type: 'finalize_now', responseId: finalizeResponseId };
}
