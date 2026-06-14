/**
 * Purchase receipts — re-exports from the unified Agent Action Surface store.
 */

export type { PurchaseReceipt } from './agentActionSurfaceStore';

export {
  addPurchaseReceipt,
  getLatestReceiptForRecipe,
  getPurchaseReceipts,
  subscribeAgentActionSurface as subscribePurchaseReceipts,
} from './agentActionSurfaceStore';
