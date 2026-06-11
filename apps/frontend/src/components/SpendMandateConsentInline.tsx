import { useSyncExternalStore } from 'react';
import {
  formatConsentPrice,
  getPendingSpendMandateConsent,
  resolveSpendMandateConsent,
  subscribeSpendMandateConsent,
} from '../lib/spendMandateConsentGate';

function usePendingConsent() {
  return useSyncExternalStore(
    subscribeSpendMandateConsent,
    getPendingSpendMandateConsent,
    () => null,
  );
}

interface SpendMandateConsentInlineProps {
  /** When set, only show if pending consent matches this recipe. */
  backendRecipeId?: string;
  className?: string;
}

/**
 * Inline Jamie consent — rendered inside the chat thread, not a modal.
 */
export function SpendMandateConsentInline({
  backendRecipeId,
  className,
}: SpendMandateConsentInlineProps) {
  const pending = usePendingConsent();

  if (!pending) {
    return null;
  }

  if (backendRecipeId && pending.backendRecipeId && pending.backendRecipeId !== backendRecipeId) {
    return null;
  }

  const priceLabel = formatConsentPrice(pending.priceAmount, pending.currencyCode);
  const ceilingLabel = formatConsentPrice(pending.ceilingAmount, pending.currencyCode);

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
          onClick={() => resolveSpendMandateConsent(true)}
        >
          Yes, put it on my Tab
        </button>
        <button
          type="button"
          className="rounded-full border border-[#D4CFC8] bg-white px-4 py-2 text-sm font-semibold text-[#5C5C5C] transition hover:bg-[#F5F3F0]"
          onClick={() => resolveSpendMandateConsent(false)}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
