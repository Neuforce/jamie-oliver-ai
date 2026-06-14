import { useState, useSyncExternalStore } from 'react';
import {
  formatConsentPrice,
  getCommerceState,
  resolveAskWithServer,
  subscribeCommerceStore,
} from '../lib/commerceStore';
import { getStoredJamieAccessUserId } from '../lib/supertab';
import { startRecipeUnlock } from '../lib/unlockController';

function usePendingAskForRecipe(recipeId?: string) {
  return useSyncExternalStore(
    subscribeCommerceStore,
    () => {
      if (!recipeId) {
        return getCommerceState().pendingAsk;
      }
      return getCommerceState(recipeId).pendingAsk;
    },
    () => null,
  );
}

interface SpendMandateConsentInlineProps {
  /** When set, only show if pending consent matches this recipe. */
  backendRecipeId?: string;
  className?: string;
  /** chat = inline thread; sheet = recipe modal portal */
  placement?: 'chat' | 'sheet';
  /** When placement is chat, hide if the recipe sheet is open for this recipe. */
  recipeSheetOpenForRecipe?: boolean;
}

/**
 * Inline Jamie consent — rendered in chat or recipe sheet from one activeAsk.
 */
export function SpendMandateConsentInline({
  backendRecipeId,
  className,
  placement = 'chat',
  recipeSheetOpenForRecipe = false,
}: SpendMandateConsentInlineProps) {
  const pendingAsk = usePendingAskForRecipe(backendRecipeId);
  const [isResolving, setIsResolving] = useState(false);

  if (!pendingAsk) {
    return null;
  }

  if (backendRecipeId && pendingAsk.recipeId !== backendRecipeId) {
    return null;
  }

  if (placement === 'chat' && recipeSheetOpenForRecipe) {
    return null;
  }

  if (placement === 'sheet' && !recipeSheetOpenForRecipe) {
    return null;
  }

  const priceLabel = formatConsentPrice(pendingAsk.priceAmount, pendingAsk.currencyCode);
  const ceilingLabel = formatConsentPrice(pendingAsk.ceilingAmount, pendingAsk.currencyCode);
  const recipeId = pendingAsk.recipeId;

  const handleApprove = async () => {
    if (isResolving) {
      return;
    }
    setIsResolving(true);
    try {
      const granted = await resolveAskWithServer(recipeId, true, getStoredJamieAccessUserId());
      if (!granted) {
        return;
      }
      await startRecipeUnlock(recipeId, { trigger: 'consent_approve' });
    } finally {
      setIsResolving(false);
    }
  };

  const handleDecline = async () => {
    if (isResolving) {
      return;
    }
    setIsResolving(true);
    try {
      await resolveAskWithServer(recipeId, false, getStoredJamieAccessUserId());
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div
      className={
        className
        ?? 'mt-3 rounded-2xl border border-[#E8E4DF] bg-[#FAFAF8] px-4 py-3'
      }
      role="group"
      aria-label="Agent spending consent"
    >
      <p className="text-sm leading-relaxed text-[#2C2C2C]">
        Mind if I put this on your Tab? It&apos;s{' '}
        <strong>{priceLabel}</strong>
        {' '}for this recipe — I won&apos;t charge again this session without asking
        (up to {ceilingLabel} total).
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="jamie-recipe-modal__header-pill"
          disabled={isResolving}
          onClick={() => void handleApprove()}
        >
          Yes, put it on my Tab
        </button>
        <button
          type="button"
          className="rounded-full border border-[#D4CFC8] bg-white px-4 py-2 text-sm font-semibold text-[#5C5C5C] transition hover:bg-[#F5F3F0]"
          disabled={isResolving}
          onClick={() => void handleDecline()}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
