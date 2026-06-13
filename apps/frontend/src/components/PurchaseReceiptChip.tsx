import { Check } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import {
  getPurchaseReceipts,
  subscribePurchaseReceipts,
} from '../lib/purchaseReceiptStore';

interface PurchaseReceiptChipProps {
  backendRecipeId?: string;
  className?: string;
}

const BASE_CLASS_NAME = 'rounded-2xl border border-[#E8E4DF] bg-[#FAFAF8] px-4 py-3';
const EMPTY_RECEIPTS = [];

export function PurchaseReceiptChip({ backendRecipeId, className }: PurchaseReceiptChipProps) {
  const receipts = useSyncExternalStore(
    subscribePurchaseReceipts,
    getPurchaseReceipts,
    () => EMPTY_RECEIPTS,
  );

  const receipt = backendRecipeId
    ? receipts.find((item) => item.backendRecipeId === backendRecipeId) ?? null
    : receipts[0] ?? null;

  if (!receipt) {
    return null;
  }

  return (
    <div
      className={className ? `${BASE_CLASS_NAME} ${className}` : BASE_CLASS_NAME}
      role="status"
      aria-label="Purchase receipt"
    >
      <div className="flex items-center gap-2 text-sm leading-relaxed text-[#2C2C2C]">
        <Check size={16} className="shrink-0 text-[#2C2C2C]" aria-hidden="true" />
        <span>
          {receipt.recipeTitle} — {receipt.priceLabel} on your Tab
        </span>
      </div>
      <p className="mt-1 text-xs text-[#9A9A9A]">
        Confirmed by the app · Secured by Supertab
      </p>
    </div>
  );
}
