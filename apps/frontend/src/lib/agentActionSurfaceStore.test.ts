import { describe, expect, it, beforeEach } from 'vitest';
import {
  getActiveSurface,
  setActiveSurface,
  shouldRenderCommerceInline,
  shouldRenderCommercePortaled,
} from './agentActionSurfaceStore';

describe('agentActionSurfaceStore', () => {
  it('routes commerce UI to recipe sheet when modal is focused', () => {
    setActiveSurface({ kind: 'recipe_sheet', backendRecipeId: 'chopped-rainbow-salad' });
    expect(getActiveSurface().kind).toBe('recipe_sheet');
    expect(shouldRenderCommercePortaled()).toBe(true);
    expect(shouldRenderCommerceInline()).toBe(false);
  });

  it('routes commerce UI to chat when discovery chat is active', () => {
    setActiveSurface({ kind: 'chat' });
    expect(shouldRenderCommerceInline()).toBe(true);
    expect(shouldRenderCommercePortaled()).toBe(false);
  });
});
