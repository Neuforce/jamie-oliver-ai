/**
 * NEU-679 — active UI surface routing (chat vs recipe sheet).
 * Commerce state (access, asks, receipts, mandate) lives in commerceStore.ts.
 */

export type AgentActiveSurface =
  | { kind: 'chat' }
  | { kind: 'recipe_sheet'; backendRecipeId: string }
  | { kind: 'none' };

type StoreListener = () => void;

let activeSurface: AgentActiveSurface = { kind: 'none' };

const listeners = new Set<StoreListener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribeAgentActionSurface(listener: StoreListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveSurface(): AgentActiveSurface {
  return activeSurface;
}

/** App / ChatView call this when the user moves between chat and recipe sheet. */
export function setActiveSurface(surface: AgentActiveSurface): void {
  activeSurface = surface;
  notifyListeners();
}

export function commerceUiTarget(): 'chat' | 'recipe_sheet' | 'none' {
  if (activeSurface.kind === 'recipe_sheet') return 'recipe_sheet';
  if (activeSurface.kind === 'chat') return 'chat';
  return 'none';
}

export function shouldRenderCommerceInline(): boolean {
  return commerceUiTarget() === 'chat';
}

export function shouldRenderCommercePortaled(): boolean {
  return commerceUiTarget() === 'recipe_sheet';
}

export function focusedBackendRecipeId(): string | undefined {
  if (activeSurface.kind === 'recipe_sheet') {
    return activeSurface.backendRecipeId;
  }
  return undefined;
}
