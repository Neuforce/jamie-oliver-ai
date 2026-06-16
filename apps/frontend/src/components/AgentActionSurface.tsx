import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';
import { SpendMandateConsentInline } from './SpendMandateConsentInline';
import { PurchaseReceiptChip } from './PurchaseReceiptChip';
import {
  focusedBackendRecipeId,
  shouldRenderCommercePortaled,
  subscribeAgentActionSurface,
} from '../lib/agentActionSurfaceStore';
import {
  getUnlockState,
  isUnlockSurfaceState,
  subscribeCommerceStore,
} from '../lib/commerceStore';

export type AgentActionSurfaceMode = 'inline' | 'portal';

interface AgentActionSurfaceProps {
  mode: AgentActionSurfaceMode;
  /** Optional recipe scope for inline chat turns (tool-bound consent). */
  backendRecipeId?: string | null;
  className?: string;
}

function useCommercePortaled() {
  return useSyncExternalStore(
    subscribeAgentActionSurface,
    shouldRenderCommercePortaled,
    () => false,
  );
}

function useUnlockSurfaceFor(recipeId?: string | null) {
  return useSyncExternalStore(
    subscribeCommerceStore,
    () => isUnlockSurfaceState(getUnlockState(recipeId)),
    () => false,
  );
}

function useFocusedRecipeId(fallback?: string | null) {
  return useSyncExternalStore(
    subscribeAgentActionSurface,
    () => focusedBackendRecipeId() ?? fallback?.trim() ?? undefined,
    () => fallback?.trim() ?? undefined,
  );
}

/**
 * Renders agent-driven consent + receipt in the recipe sheet portal.
 */
export function AgentActionSurface({
  mode,
  backendRecipeId,
  className,
}: AgentActionSurfaceProps) {
  const showPortaled = useCommercePortaled();
  const recipeId = useFocusedRecipeId(backendRecipeId);
  const showConsent = useUnlockSurfaceFor(recipeId);

  if (mode === 'portal' && !showPortaled) {
    return null;
  }
  if (!showConsent && !recipeId) {
    return null;
  }

  const content = (
    <div
      className={
        mode === 'portal'
          ? 'pointer-events-auto fixed left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-[10060] mx-auto max-w-md space-y-3'
          : className ?? 'space-y-3'
      }
      aria-live="polite"
    >
      {showConsent ? (
        <SpendMandateConsentInline
          backendRecipeId={recipeId}
          className={mode === 'portal' ? 'shadow-lg' : undefined}
          placement="sheet"
          recipeSheetOpenForRecipe={showPortaled}
        />
      ) : recipeId ? (
        <PurchaseReceiptChip
          backendRecipeId={recipeId}
          className={mode === 'portal' ? 'shadow-lg' : undefined}
          bypassSurfaceGate={mode === 'portal'}
        />
      ) : null}
    </div>
  );

  if (mode === 'portal') {
    return createPortal(content, document.body);
  }

  return content;
}
