import { describe, expect, it, beforeEach } from 'vitest';
import {
  getRecipeDetailViewLabel,
  isRecipeDetailViewDisabled,
  resolveUnlockSurfaceRecipeId,
  shouldMountSpendMandateConsentInline,
} from './unlockSurfaceInline';
import { resetCommerceStoreForTests, setUnlockState } from './commerceStore';
import type { ToolInvocationPart } from './chatStream';

describe('unlockSurfaceInline', () => {
  beforeEach(() => {
    resetCommerceStoreForTests();
  });

  it('derives recipe id from paywall part for auto-charge turns', () => {
    const toolParts: ToolInvocationPart[] = [
      {
        toolCallId: 'call-unlock',
        toolName: 'request_supertab_unlock',
        status: 'completed',
        outputKind: 'paywall',
        paywallBackendId: 'fish-pie',
      },
    ];

    expect(
      resolveUnlockSurfaceRecipeId({
        toolParts,
        recipeDetail: { recipe_id: 'fish-pie', title: 'Fish pie' },
      }),
    ).toBe('fish-pie');
  });

  it('mounts inline unlock surface for paywall auto-charge when processing', () => {
    setUnlockState('fish-pie', 'processing');

    const toolParts: ToolInvocationPart[] = [
      {
        toolCallId: 'call-unlock',
        toolName: 'request_supertab_unlock',
        status: 'completed',
        outputKind: 'paywall',
        paywallBackendId: 'fish-pie',
      },
    ];

    expect(
      shouldMountSpendMandateConsentInline({
        toolParts,
        recipeDetail: { recipe_id: 'fish-pie', title: 'Fish pie' },
      }),
    ).toBe(true);
  });

  it('does not mount inline unlock surface for paywall when still locked', () => {
    const toolParts: ToolInvocationPart[] = [
      {
        toolCallId: 'call-unlock',
        toolName: 'request_supertab_unlock',
        status: 'completed',
        outputKind: 'paywall',
        paywallBackendId: 'fish-pie',
      },
    ];

    expect(
      shouldMountSpendMandateConsentInline({
        toolParts,
        recipeDetail: { recipe_id: 'fish-pie', title: 'Fish pie' },
      }),
    ).toBe(false);
  });

  it('still mounts for mandate_consent parts without active unlock state', () => {
    const toolParts: ToolInvocationPart[] = [
      {
        toolCallId: 'call-unlock',
        toolName: 'request_supertab_unlock',
        status: 'running',
        outputKind: 'mandate_consent',
        paywallBackendId: 'fish-pie',
      },
    ];

    expect(shouldMountSpendMandateConsentInline({ toolParts })).toBe(true);
  });

  it('disables and relabels View full recipe while processing', () => {
    setUnlockState('fish-pie', 'processing');

    expect(isRecipeDetailViewDisabled('fish-pie')).toBe(true);
    expect(getRecipeDetailViewLabel('fish-pie')).toBe('Putting it on your Tab…');
  });

  it('keeps View full recipe enabled when not processing', () => {
    expect(isRecipeDetailViewDisabled('fish-pie')).toBe(false);
    expect(getRecipeDetailViewLabel('fish-pie')).toBe('View full recipe');
  });
});
