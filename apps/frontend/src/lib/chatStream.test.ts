import { describe, expect, it } from 'vitest';
import {
  createChatTurnStreamState,
  getFeaturedToolPart,
  reduceChatStreamEvent,
} from './chatStream';

describe('chatStream', () => {
  it('binds card output to toolCallId and prefers last card in turn', () => {
    let state = createChatTurnStreamState();

    state = reduceChatStreamEvent(state, {
      type: 'tool_call',
      content: 'search_recipes',
      metadata: { tool_call_id: 'call-search', response_id: 'turn-1' },
    });
    state = reduceChatStreamEvent(state, {
      type: 'recipes',
      content: '',
      metadata: {
        tool_call_id: 'call-search',
        response_id: 'turn-1',
        recipes: [{ recipe_id: 'fish-chips-mushy-peas', title: 'Fish & chips' }],
      },
    });
    state = reduceChatStreamEvent(state, {
      type: 'tool_call',
      content: 'request_supertab_unlock',
      metadata: { tool_call_id: 'call-unlock', response_id: 'turn-1' },
    });
    state = reduceChatStreamEvent(state, {
      type: 'recipe_detail',
      content: '',
      metadata: {
        tool_call_id: 'call-unlock',
        response_id: 'turn-1',
        recipe: { recipe_id: 'fish-chips-mushy-peas', title: 'Fish & chips', description: 'x' },
      },
    });
    state = reduceChatStreamEvent(state, {
      type: 'recipe_paywall_requested',
      content: '',
      metadata: {
        tool_call_id: 'call-unlock',
        response_id: 'turn-1',
        backend_recipe_id: 'fish-chips-mushy-peas',
      },
    });

    const featured = getFeaturedToolPart(state.parts);
    expect(featured?.toolCallId).toBe('call-unlock');
    expect(featured?.recipeDetail?.recipe_id).toBe('fish-chips-mushy-peas');
    expect(featured?.outputKind).toBe('paywall');
  });
});
