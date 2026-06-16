import { describe, expect, it } from 'vitest';
import {
  finalizeVoiceBubbleMessages,
  resolveVoiceDoneAction,
  shouldFinalizeVoiceBubble,
} from './voiceBubbleFinalize';

describe('voiceBubbleFinalize', () => {
  it('finalizes the bubble matched by responseId after interrupt', () => {
    const messages = [
      {
        id: 'turn-1',
        content: 'Hello there',
        isStreaming: true,
        voiceResponseId: 'resp-1',
      },
      {
        id: 'turn-2',
        content: '',
        isStreaming: true,
        voiceResponseId: 'resp-2',
      },
    ];

    const interrupted = finalizeVoiceBubbleMessages(messages, {
      responseId: 'resp-1',
      currentMessageId: 'turn-2',
      accumulatedText: 'Next answer',
    });

    expect(interrupted.messages[0]).toMatchObject({
      content: 'Hello there',
      isStreaming: false,
    });
    expect(interrupted.messages[1].isStreaming).toBe(true);
    expect(interrupted.finalizedCurrentMessage).toBe(false);
  });

  it('finalizes overlapping turns on the correct bubble by responseId', () => {
    const messages = [
      {
        id: 'turn-1',
        content: 'First answer',
        isStreaming: true,
        voiceResponseId: 'resp-1',
      },
      {
        id: 'turn-2',
        content: '',
        isStreaming: true,
        voiceResponseId: 'resp-2',
      },
    ];

    const lateDone = finalizeVoiceBubbleMessages(messages, {
      responseId: 'resp-1',
      currentMessageId: 'turn-2',
      accumulatedText: 'Second answer in progress',
    });

    expect(lateDone.messages[0]).toMatchObject({
      content: 'First answer',
      isStreaming: false,
    });
    expect(lateDone.messages[1]).toMatchObject({
      content: '',
      isStreaming: true,
      voiceResponseId: 'resp-2',
    });
  });

  it('uses the accumulator for the current bubble when done never arrives', () => {
    const messages = [
      {
        id: 'turn-1',
        content: '',
        isStreaming: true,
        voiceResponseId: 'resp-1',
      },
    ];

    const safetyNet = finalizeVoiceBubbleMessages(messages, {
      currentMessageId: 'turn-1',
      accumulatedText: 'Recovered transcript text',
    });

    expect(safetyNet.messages[0]).toMatchObject({
      content: 'Recovered transcript text',
      isStreaming: false,
    });
    expect(safetyNet.finalizedCurrentMessage).toBe(true);
  });

  it('accepts done after activeResponseId was reset', () => {
    expect(
      resolveVoiceDoneAction('resp-1', null, false),
    ).toEqual({ type: 'finalize_now', responseId: 'resp-1' });
  });

  it('defers done while audio is still playing', () => {
    expect(
      resolveVoiceDoneAction('resp-1', 'resp-1', true),
    ).toEqual({ type: 'defer', responseId: 'resp-1' });
  });

  it('treats interrupted then done as idempotent for the same bubble', () => {
    const streaming = {
      id: 'turn-1',
      content: 'Jamie reply',
      isStreaming: true,
      voiceResponseId: 'resp-1',
    };

    expect(
      shouldFinalizeVoiceBubble(streaming, { responseId: 'resp-1', currentMessageId: 'turn-2' }),
    ).toBe(true);

    const finalized = { ...streaming, isStreaming: false as const };
    expect(
      shouldFinalizeVoiceBubble(finalized, { responseId: 'resp-1', currentMessageId: 'turn-2' }),
    ).toBe(false);
  });
});
