import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Loader2, Check, Lock, AlertCircle } from 'lucide-react';
import {
  formatConsentPrice,
  getActiveAsk,
  getRecipeReceipt,
  getUnlockAskMeta,
  getUnlockState,
  setUnlockState,
  subscribeCommerceStore,
  type UnlockState,
} from '../lib/commerceStore';
import { getStoredJamieAccessUserId } from '../lib/supertab';
import {
  confirmUnlock,
  connectTab,
  declineUnlock,
  requestCheckout,
} from '../lib/unlockController';

/** How long a terminal-but-transient state stays before the card collapses. */
const COLLAPSE_DELAY_MS = 1800;

function useActiveAskRecipeId(): string | null {
  return useSyncExternalStore(
    subscribeCommerceStore,
    () => getActiveAsk()?.recipeId ?? null,
    () => null,
  );
}

function useUnlockStateFor(recipeId?: string): UnlockState {
  return useSyncExternalStore(
    subscribeCommerceStore,
    () => getUnlockState(recipeId),
    () => 'locked',
  );
}

function useAskMetaFor(recipeId?: string) {
  return useSyncExternalStore(
    subscribeCommerceStore,
    () => getUnlockAskMeta(recipeId),
    () => null,
  );
}

function useReceiptFor(recipeId?: string) {
  return useSyncExternalStore(
    subscribeCommerceStore,
    () => (recipeId ? getRecipeReceipt(recipeId) : null),
    () => null,
  );
}

interface SpendMandateConsentInlineProps {
  /** When set, only show if the unlock surface matches this recipe. */
  backendRecipeId?: string;
  className?: string;
  /** chat = inline thread; sheet = recipe modal portal */
  placement?: 'chat' | 'sheet';
  /** When placement is chat, hide if the recipe sheet is open for this recipe. */
  recipeSheetOpenForRecipe?: boolean;
}

/**
 * Inline Jamie consent + unlock surface. Driven entirely by the per-recipe
 * `unlockState` projection (NOT by the ask unmounting), so it can show progress
 * and terminal outcomes in place. The view is dumb: it renders state and calls
 * controller verbs (confirmUnlock / declineUnlock / requestCheckout / connectTab).
 */
export function SpendMandateConsentInline({
  backendRecipeId,
  className,
  placement = 'chat',
  recipeSheetOpenForRecipe = false,
}: SpendMandateConsentInlineProps) {
  const activeAskRecipeId = useActiveAskRecipeId();
  const recipeId = backendRecipeId?.trim() || activeAskRecipeId || undefined;

  const unlockState = useUnlockStateFor(recipeId);
  const askMeta = useAskMetaFor(recipeId);
  const receipt = useReceiptFor(recipeId);

  // Collapse transient terminal states back to 'locked' (card unmounts). The
  // recipe card badge already shows Unlocked from the access projection.
  useEffect(() => {
    if (!recipeId) {
      return;
    }
    if (unlockState !== 'unlocked' && unlockState !== 'declined') {
      return;
    }
    const timer = setTimeout(() => {
      setUnlockState(recipeId, 'locked');
    }, COLLAPSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [recipeId, unlockState]);

  if (!recipeId) {
    return null;
  }

  if (placement === 'chat' && recipeSheetOpenForRecipe) {
    return null;
  }

  if (placement === 'sheet' && !recipeSheetOpenForRecipe) {
    return null;
  }

  // Only the surface states render a card; 'locked' means no active surface.
  if (unlockState === 'locked') {
    return null;
  }

  const containerClassName =
    className ?? 'mt-3 rounded-2xl border border-[#E8E4DF] bg-[#FAFAF8] px-4 py-3';
  const userId = getStoredJamieAccessUserId();

  const priceLabel = askMeta ? formatConsentPrice(askMeta.priceAmount, askMeta.currencyCode) : null;
  const ceilingLabel = askMeta
    ? formatConsentPrice(askMeta.ceilingAmount, askMeta.currencyCode)
    : null;

  const wrap = (children: ReactNode) => (
    <div
      className={containerClassName}
      role="group"
      aria-label="Agent spending consent"
      aria-live="polite"
    >
      {children}
    </div>
  );

  if (unlockState === 'requested') {
    return wrap(
      <>
        <p className="text-sm leading-relaxed text-[#2C2C2C]">
          Mind if I put this on your Tab?{priceLabel ? ' It\u2019s ' : ' '}
          {priceLabel ? <strong>{priceLabel}</strong> : null}
          {priceLabel ? ' for this recipe' : 'Just this recipe'} — I won&apos;t charge again this
          session without asking{ceilingLabel ? ` (up to ${ceilingLabel} total)` : ''}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="jamie-recipe-modal__header-pill"
            onClick={() => void confirmUnlock(recipeId, userId)}
          >
            Yes, put it on my Tab
          </button>
          <button
            type="button"
            className="rounded-full border border-[#D4CFC8] bg-white px-4 py-2 text-sm font-semibold text-[#5C5C5C] transition hover:bg-[#F5F3F0]"
            onClick={() => void declineUnlock(recipeId, userId)}
          >
            Not now
          </button>
        </div>
      </>,
    );
  }

  if (unlockState === 'processing') {
    return wrap(
      <div className="flex items-center gap-2 text-sm font-medium text-[#2C2C2C]">
        <Loader2 size={16} className="animate-spin text-[#7C5AC3]" aria-hidden="true" />
        <span>Putting it on your Tab…</span>
      </div>,
    );
  }

  if (unlockState === 'unlocked') {
    return wrap(
      <>
        <div className="flex items-center gap-2 text-sm font-medium text-[#10B981]">
          <Check size={16} aria-hidden="true" />
          <span>Added to your Tab — recipe unlocked</span>
        </div>
        {receipt ? (
          <p className="mt-1 text-xs text-[#9A9A9A]">
            {receipt.recipeTitle} — {receipt.priceLabel} on your Tab · Secured by Supertab
          </p>
        ) : null}
      </>,
    );
  }

  if (unlockState === 'needsCheckout') {
    return wrap(
      <>
        <p className="text-sm leading-relaxed text-[#2C2C2C]">
          Almost there — finish checkout to put this recipe on your Tab.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="jamie-recipe-modal__header-pill"
            onClick={() => requestCheckout(recipeId)}
          >
            Complete checkout
          </button>
        </div>
      </>,
    );
  }

  if (unlockState === 'noTab') {
    return wrap(
      <>
        <p className="text-sm leading-relaxed text-[#2C2C2C]">
          Connect your Tab to unlock this recipe — it only takes a moment.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="jamie-recipe-modal__header-pill"
            onClick={() => connectTab()}
          >
            Connect My Tab
          </button>
        </div>
      </>,
    );
  }

  if (unlockState === 'failed') {
    return wrap(
      <>
        <p className="flex items-center gap-2 text-sm leading-relaxed text-[#2C2C2C]">
          <AlertCircle size={16} className="text-[#C2410C]" aria-hidden="true" />
          <span>Couldn&apos;t add it to your Tab.</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="jamie-recipe-modal__header-pill"
            onClick={() => void confirmUnlock(recipeId, userId)}
          >
            Try again
          </button>
        </div>
      </>,
    );
  }

  if (unlockState === 'declined') {
    return wrap(
      <div className="flex items-center gap-2 text-sm text-[#5C5C5C]">
        <Lock size={16} aria-hidden="true" />
        <span>No problem — ask me again anytime.</span>
      </div>,
    );
  }

  return null;
}
