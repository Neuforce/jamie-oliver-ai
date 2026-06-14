/**
 * Spend mandate consent — re-exports from the unified Agent Action Surface store.
 */

export type { SpendMandateConsentParams } from './agentActionSurfaceStore';

export {
  formatConsentPrice,
  getPendingSpendMandateConsent,
  requestSpendMandateConsent,
  resolveSpendMandateConsent,
  subscribeAgentActionSurface as subscribeSpendMandateConsent,
} from './agentActionSurfaceStore';
