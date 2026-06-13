export interface PurchaseReceipt {
  id: string;
  backendRecipeId: string;
  recipeTitle: string;
  priceLabel: string;
  timestamp: number;
}

type PurchaseReceiptListener = () => void;

const MAX_RECEIPTS = 5;
const listeners = new Set<PurchaseReceiptListener>();
let receipts: PurchaseReceipt[] = [];

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribePurchaseReceipts(listener: PurchaseReceiptListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPurchaseReceipts(): PurchaseReceipt[] {
  return receipts;
}

export function addPurchaseReceipt(
  receipt: Omit<PurchaseReceipt, 'id' | 'timestamp'>,
): PurchaseReceipt {
  const nextReceipt: PurchaseReceipt = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...receipt,
  };

  receipts = [nextReceipt, ...receipts].slice(0, MAX_RECEIPTS);
  notifyListeners();
  return nextReceipt;
}

export function getLatestReceiptForRecipe(backendRecipeId: string): PurchaseReceipt | null {
  return receipts.find((receipt) => receipt.backendRecipeId === backendRecipeId) ?? null;
}
