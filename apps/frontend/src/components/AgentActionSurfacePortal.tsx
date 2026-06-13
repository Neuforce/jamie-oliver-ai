import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';
import { SpendMandateConsentInline } from './SpendMandateConsentInline';
import { PurchaseReceiptChip } from './PurchaseReceiptChip';
import {
  getPendingSpendMandateConsent,
  subscribeSpendMandateConsent,
} from '../lib/spendMandateConsentGate';

interface AgentActionSurfacePortalProps {
  backendRecipeId?: string | null;
}

function usePendingConsent() {
  return useSyncExternalStore(
    subscribeSpendMandateConsent,
    getPendingSpendMandateConsent,
    () => null,
  );
}

/**
 * Portals agent-driven asks and receipts above the recipe modal so voice/chat
 * commerce UI stays visible while the sheet is open.
 */
export function AgentActionSurfacePortal({ backendRecipeId }: AgentActionSurfacePortalProps) {
  const pending = usePendingConsent();
  const recipeId = backendRecipeId?.trim() || pending?.backendRecipeId || undefined;

  if (!pending && !recipeId) {
    return null;
  }

  return createPortal(
    <div
      className="pointer-events-auto fixed left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-[10060] mx-auto max-w-md space-y-3"
      aria-live="polite"
    >
      {pending ? (
        <SpendMandateConsentInline backendRecipeId={recipeId} className="shadow-lg" />
      ) : null}
      {recipeId ? <PurchaseReceiptChip backendRecipeId={recipeId} className="shadow-lg" /> : null}
    </div>,
    document.body,
  );
}
