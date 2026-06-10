import { loadSupertab } from '@getsupertab/supertab-js';
import {
  bootstrapSupertabIdentity,
  createSpendMandate,
  getCurrentSpendMandate,
  getRecipeAccess,
  syncSupertabPurchase,
  type PurchaseIntent,
  type RecipeAccessResponse,
} from './api';

const JAMIE_USER_ID_KEY = 'jamie-supertab-user-id';
const JAMIE_SUBJECT_ID_KEY = 'jamie-supertab-subject-id';

type SupertabClient = InstanceType<(Awaited<ReturnType<typeof loadSupertab>>)['Supertab']>;
type RawSupertabCustomer = Awaited<ReturnType<SupertabClient['api']['retrieveCustomer']>>;
type RawSupertabCustomerUser = NonNullable<RawSupertabCustomer['user']>;
type RawSupertabSite = Awaited<ReturnType<SupertabClient['api']['retrieveSite']>>;
type SupertabPurchaseButtonState = Awaited<ReturnType<SupertabClient['createPurchaseButton']>>['initialState'];
type SupertabPurchaseButtonHandle = Awaited<ReturnType<SupertabClient['createPurchaseButton']>> & {
  show?: () => Promise<unknown>;
};

let supertabClientPromise: Promise<SupertabClient> | null = null;
let siteOfferingsCache: Array<{ id: string; contentKey?: string | null; description?: string | null }> | null = null;

const DEFAULT_AGENTIC_MANDATE_CEILING_CENTS = 1000;
const SPEND_MANDATE_SESSION_KEY = 'jamie-spend-mandate-session';

export type MyTabStatus = 'unavailable' | 'signed_out' | 'signed_in';
export type MyTabMessageTone = 'neutral' | 'error';

export interface MyTabAccountSummary {
  email?: string | null;
  displayName?: string | null;
  isGuest: boolean;
  isTestMode: boolean;
  totalLabel?: string | null;
  limitLabel?: string | null;
  purchaseCount: number;
  recentPurchaseLabel?: string | null;
}

export interface MyTabSiteSummary {
  name?: string | null;
  logoUrl?: string | null;
}

export interface MyTabSnapshot {
  status: MyTabStatus;
  userId?: string;
  account?: MyTabAccountSummary | null;
  site?: MyTabSiteSummary | null;
  message?: string | null;
  messageTone?: MyTabMessageTone;
}

function getClientId(): string | undefined {
  return import.meta.env.VITE_SUPERTAB_CLIENT_ID;
}

function getPaywallExperienceId(access: RecipeAccessResponse): string | undefined {
  return access.offering?.supertabExperienceId || import.meta.env.VITE_SUPERTAB_PAYWALL_EXPERIENCE_ID;
}

function getPurchaseButtonExperienceId(): string | undefined {
  return import.meta.env.VITE_SUPERTAB_PURCHASE_BUTTON_EXPERIENCE_ID;
}

function getStoredJamieUserId(): string | null {
  return localStorage.getItem(JAMIE_USER_ID_KEY);
}

function setStoredJamieUserId(userId: string): void {
  localStorage.setItem(JAMIE_USER_ID_KEY, userId);
}

function setStoredSubjectId(subjectId: string): void {
  localStorage.setItem(JAMIE_SUBJECT_ID_KEY, subjectId);
}

function getOrCreateSubjectId(): string {
  const existing = localStorage.getItem(JAMIE_SUBJECT_ID_KEY);
  if (existing) {
    return existing;
  }
  const created = `jamie-browser-${crypto.randomUUID()}`;
  localStorage.setItem(JAMIE_SUBJECT_ID_KEY, created);
  return created;
}

async function getSupertabClient(): Promise<SupertabClient> {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('Supertab client ID is not configured.');
  }

  if (!supertabClientPromise) {
    supertabClientPromise = loadSupertab().then(({ Supertab }) => {
      return new Supertab({ clientId });
    });
  }

  return supertabClientPromise;
}

export function hasSupertabConfig(): boolean {
  return Boolean(getClientId());
}

/** True when the in-modal Purchase Button can mount (same config as tapping “Put it on my Tab”). */
export function canEmbedRecipePurchaseButton(access: RecipeAccessResponse): boolean {
  return Boolean(
    getClientId() && getPurchaseButtonExperienceId() && access.offering?.contentKey,
  );
}

/** True only when access is positively resolved as cookable. */
export function canStartCookingWithAccess(access: RecipeAccessResponse | null | undefined): boolean {
  return access?.accessState === 'free' || access?.accessState === 'owned';
}

const DEFAULT_ACCESS_POLL_ATTEMPTS = 6;
const DEFAULT_ACCESS_POLL_INTERVAL_MS = 500;

/** Poll access after purchase when webhook/sync may lag behind Supertab. */
export async function pollRecipeAccessUntilUnlocked(
  recipeId: string,
  userId: string,
  options: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<RecipeAccessResponse | null> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_ACCESS_POLL_ATTEMPTS;
  const intervalMs = options.intervalMs ?? DEFAULT_ACCESS_POLL_INTERVAL_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const access = await getRecipeAccess(recipeId, userId);
    if (canStartCookingWithAccess(access)) {
      return access;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return null;
}

function formatPrice(price?: {
  amount: number;
  currency: { symbol: string; baseUnit: number; code: string };
} | null): string | null {
  if (!price) {
    return null;
  }

  const divisor = price.currency.baseUnit || 100;
  const normalizedAmount = price.amount / divisor;
  const symbol = price.currency.symbol || price.currency.code;
  return `${symbol}${normalizedAmount.toFixed(2)}`;
}

function buildDisplayName(user?: RawSupertabCustomerUser | null): string | null {
  if (!user) {
    return null;
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.email || user.guestEmail || null;
}

function mapCustomerSummary(customer: RawSupertabCustomer): MyTabAccountSummary | null {
  if (!customer.authenticated) {
    return null;
  }

  const purchases = Array.isArray(customer.tab?.purchases) ? customer.tab.purchases : [];
  const recentPurchase = purchases.find((purchase) => purchase?.description);

  return {
    email: customer.user?.email ?? customer.user?.guestEmail ?? null,
    displayName: buildDisplayName(customer.user),
    isGuest: customer.user?.isGuest ?? false,
    isTestMode: customer.tab?.testMode ?? false,
    totalLabel: formatPrice(customer.tab?.total),
    limitLabel: formatPrice(customer.tab?.limit),
    purchaseCount: purchases.length,
    recentPurchaseLabel: recentPurchase?.description ?? null,
  };
}

function mapSiteSummary(site?: RawSupertabSite | null): MyTabSiteSummary | null {
  if (!site) {
    return null;
  }

  return {
    name: site.name ?? null,
    logoUrl: typeof site.logoUrl === 'string' ? site.logoUrl : null,
  };
}

export async function ensureJamieSupertabUser(customerUser?: RawSupertabCustomerUser | null): Promise<string> {
  const existingUserId = getStoredJamieUserId();
  const profile = customerUser
    ? {
        email: customerUser.email,
        first_name: customerUser.firstName,
        last_name: customerUser.lastName,
        guest_email: customerUser.guestEmail,
        is_guest: customerUser.isGuest,
        metadata: {
          source: 'supertab-auth',
        },
      }
    : {
        metadata: {
          source: 'browser-fallback',
        },
      };

  if (customerUser?.id) {
    setStoredSubjectId(customerUser.id);
    const response = await bootstrapSupertabIdentity({
      provider: 'supertab',
      external_subject_id: customerUser.id,
      profile,
    });
    setStoredJamieUserId(response.user.id);
    return response.user.id;
  }

  if (existingUserId) {
    return existingUserId;
  }

  const subjectId = getOrCreateSubjectId();
  const response = await bootstrapSupertabIdentity({
    provider: 'supertab',
    external_subject_id: subjectId,
    profile,
  });
  setStoredJamieUserId(response.user.id);
  return response.user.id;
}

async function retrieveMyTabCustomer(client: SupertabClient): Promise<RawSupertabCustomer | null> {
  try {
    return await client.api.retrieveCustomer();
  } catch (error) {
    console.error('Failed to retrieve My Tab customer:', error);
    return null;
  }
}

async function retrieveMyTabSite(client: SupertabClient): Promise<RawSupertabSite | null> {
  try {
    return await client.api.retrieveSite();
  } catch (error) {
    console.error('Failed to retrieve My Tab site:', error);
    return null;
  }
}

async function buildSignedInSnapshot(client: SupertabClient): Promise<MyTabSnapshot> {
  const customer = await retrieveMyTabCustomer(client);
  const site = await retrieveMyTabSite(client);
  const account = customer ? mapCustomerSummary(customer) : null;

  try {
    const userId = await ensureJamieSupertabUser(customer?.user ?? null);
    return {
      status: 'signed_in',
      userId,
      account,
      site: mapSiteSummary(site),
    };
  } catch (error) {
    console.error('Failed to sync Jamie user from My Tab:', error);
    return {
      status: 'signed_in',
      account,
      site: mapSiteSummary(site),
      message: 'My Tab is connected, but your Jamie account details could not sync yet.',
      messageTone: 'error',
    };
  }
}

export async function loadMyTabSnapshot(): Promise<MyTabSnapshot> {
  if (!hasSupertabConfig()) {
    return {
      status: 'unavailable',
      message: 'Add your Supertab client ID to enable My Tab.',
      messageTone: 'neutral',
    };
  }

  const client = await getSupertabClient();
  const site = await retrieveMyTabSite(client);
  const status = client.auth.status;

  if (status === 'valid') {
    return buildSignedInSnapshot(client);
  }

  const silentSession = await client.auth.start({ silently: true });
  return silentSession
    ? buildSignedInSnapshot(client)
    : {
        status: 'signed_out',
        site: mapSiteSummary(site),
      };
}

export async function openMyTab(): Promise<MyTabSnapshot> {
  return loadMyTabSnapshot();
}

export interface RecipePurchaseResolution {
  snapshot: MyTabSnapshot;
  refreshedAccess?: RecipeAccessResponse | null;
  state: SupertabPurchaseButtonState;
  priorEntitlements: Array<Record<string, unknown>>;
}

interface MountRecipePurchaseButtonOptions {
  containerElement: HTMLElement;
  access: RecipeAccessResponse;
  onResolved?: (resolution: RecipePurchaseResolution) => void;
  onError?: (message: string) => void;
  /**
   * When false, skip syncing `initialState` on mount. Use before calling
   * `openPurchaseExperience()` so the UX matches tapping the pane button fresh.
   * @default true
   */
  syncInitialOutcome?: boolean;
}

/** Result of embedding the Supertab purchase-button SDK in a DOM node */
export type MountedRecipePurchaseButton = {
  destroy: () => void;
  /** Prefer `show()` when the SDK exposes it; otherwise a delegated container click — same wiring as tapping the pane */
  openPurchaseExperience: () => Promise<void>;
};

function normalizePriorEntitlements(priorEntitlement: unknown): Array<Record<string, unknown>> {
  if (!priorEntitlement) {
    return [];
  }

  if (Array.isArray(priorEntitlement)) {
    return priorEntitlement.filter(
      (entitlement): entitlement is Record<string, unknown> =>
        entitlement !== null && typeof entitlement === 'object'
    );
  }

  if (typeof priorEntitlement === 'object') {
    return [priorEntitlement as Record<string, unknown>];
  }

  return [];
}

async function resolvePurchaseOutcome(
  access: RecipeAccessResponse,
  state: SupertabPurchaseButtonState,
  onResolved?: (resolution: RecipePurchaseResolution) => void
): Promise<void> {
  const priorEntitlements = normalizePriorEntitlements(state.priorEntitlement);
  const hasPurchaseOutcome = Boolean(state.purchase) || priorEntitlements.length > 0;
  const snapshot = await loadMyTabSnapshot();

  let refreshedAccess: RecipeAccessResponse | null = null;
  if (hasPurchaseOutcome && snapshot.userId) {
    await syncSupertabPurchase({
      user_id: snapshot.userId,
      recipe_id: access.recipeId,
      purchase: state.purchase || null,
      prior_entitlement: priorEntitlements,
    });
    refreshedAccess = await getRecipeAccess(access.recipeId, snapshot.userId);
  }

  onResolved?.({
    snapshot,
    refreshedAccess,
    state,
    priorEntitlements,
  });
}

/**
 * Mimic a real user tap on the Supertab-injected control (not the SDK `show()` shortcut).
 * Walks shadow roots recursively.
 */
function tryClickPurchaseControlLikeUser(containerElement: HTMLElement): boolean {
  const selectors =
    'button:not([disabled]),[role="button"]:not([aria-disabled="true"]),a[href]';

  const pick = (root: Document | Element | ShadowRoot): HTMLElement | null => {
    const el = root.querySelector<HTMLElement>(selectors);
    if (el) {
      return el;
    }
    const nodes = root.querySelectorAll('*');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n instanceof HTMLElement && n.shadowRoot) {
        const inner = pick(n.shadowRoot);
        if (inner) {
          return inner;
        }
      }
    }
    return null;
  };

  const target = pick(containerElement);
  if (!target) {
    return false;
  }
  target.click();
  return true;
}

/**
 * Voice: same as the user tapping “Put it on my Tab” — find the in-modal Supertab mount in the
 * live DOM (scoped to the recipe sheet when possible) and `.click()` the real control.
 */
export function clickVisibleJamieSupertabPurchaseButton(): boolean {
  const host =
    document.querySelector<HTMLElement>(
      '[data-supertab-pane] [data-jamie-supertab-purchase-host]',
    ) ?? document.querySelector<HTMLElement>('[data-jamie-supertab-purchase-host]');
  if (!host) {
    return false;
  }
  return tryClickPurchaseControlLikeUser(host);
}

export async function mountRecipePurchaseButton({
  containerElement,
  access,
  onResolved,
  onError,
  syncInitialOutcome = true,
}: MountRecipePurchaseButtonOptions): Promise<MountedRecipePurchaseButton> {
  const fail = (copy: string): MountedRecipePurchaseButton => {
    onError?.(copy);
    return {
      destroy: () => undefined,
      openPurchaseExperience: async () => {
        console.warn('[supertab] openPurchaseExperience no-op:', copy);
      },
    };
  };

  const client = await getSupertabClient();
  const experienceId = getPurchaseButtonExperienceId();

  if (!experienceId) {
    return fail('Add the Supertab purchase button experience ID to enable recipe unlocks.');
  }

  if (!access.offering) {
    return fail('This recipe is not configured for My Tab yet. Please try again soon.');
  }

  if (!access.offering.contentKey) {
    return fail('This recipe is missing a Supertab content key, so the purchase button cannot load.');
  }

  containerElement.innerHTML = '';
  const button = await client.createPurchaseButton({
    containerElement,
    experienceId,
    purchaseMetadata: {
      recipeId: access.recipeId,
      contentKey: access.offering.contentKey,
      jamieUserId: getStoredJamieUserId(),
    },
    onDone: (state) => {
      void resolvePurchaseOutcome(access, state, onResolved).catch((error) => {
        console.error('Failed to process Supertab purchase result:', error);
        onError?.('We could not sync your Supertab purchase back to Jamie.');
      });
    },
  }) as SupertabPurchaseButtonHandle;

  let isLaunchingFromShow = false;
  let detachShowHandler = () => undefined;

  if (typeof button.show === 'function') {
    console.info('Supertab purchase button exposes show(); wiring explicit launch fallback.');
    const handleContainerClick = () => {
      if (isLaunchingFromShow) {
        return;
      }

      isLaunchingFromShow = true;
      void button.show?.().catch((error) => {
        console.error('Supertab purchase button show() failed:', error);
        onError?.('Supertab could not launch the purchase button flow.');
      }).finally(() => {
        isLaunchingFromShow = false;
      });
    };

    containerElement.addEventListener('click', handleContainerClick);
    detachShowHandler = () => {
      containerElement.removeEventListener('click', handleContainerClick);
    };
  } else {
    console.info('Supertab purchase button returned no show(); relying on embedded widget click handling.');
  }

  async function openPurchaseExperience(): Promise<void> {
    // Prefer a real DOM .click() on the widget Supertab rendered — same class of event as a finger tap.
    if (tryClickPurchaseControlLikeUser(containerElement)) {
      return;
    }
    if (typeof button.show === 'function') {
      await button.show();
      return;
    }
    containerElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
    );
  }

  if (syncInitialOutcome && 'initialState' in button && button.initialState) {
    void resolvePurchaseOutcome(access, button.initialState, onResolved).catch((error) => {
      console.error('Failed to process Supertab initial purchase state:', error);
    });
  }

  return {
    destroy: () => {
      detachShowHandler();
      button.destroy();
    },
    openPurchaseExperience,
  };
}

export interface LaunchRecipePaywallResult {
  status: 'completed' | 'abandoned' | 'prior-entitlement' | 'unavailable';
  userId?: string;
  refreshedAccess?: RecipeAccessResponse;
}

export type PurchaseRecipeVia = 'on_tab' | 'embedded' | 'paywall' | 'unavailable' | 'abandoned';

export type { PurchaseIntent };

export interface PurchaseRecipeOutcome {
  via: PurchaseRecipeVia;
  resolution: RecipePurchaseResolution | null;
  paywallResult?: LaunchRecipePaywallResult;
}

export interface PurchaseRecipeOptions {
  /** Agent/voice path: ensure spend mandate before silent charge. */
  agentic?: boolean;
  /** Opens the in-modal embedded Supertab checkout (same as tapping "Put it on my Tab"). */
  openEmbeddedCheckout?: () => Promise<void>;
  /** Resolves when embedded `onDone` fires; omit to skip the embed path. */
  waitForEmbeddedResolution?: () => Promise<RecipePurchaseResolution | null>;
  /** One-time consent prompt for agentic spend mandate. */
  requestSpendMandateConsent?: (params: {
    ceilingAmount: number;
    currencyCode: string;
    priceAmount: number;
  }) => Promise<boolean>;
}

function getSpendMandateSessionId(): string {
  const existing = sessionStorage.getItem(SPEND_MANDATE_SESSION_KEY);
  if (existing) {
    return existing;
  }
  const created = `jamie-session-${crypto.randomUUID()}`;
  sessionStorage.setItem(SPEND_MANDATE_SESSION_KEY, created);
  return created;
}

export function buildPurchaseIntent(
  access: RecipeAccessResponse,
  userId: string,
  offeringId?: string | null,
  mandateId?: string | null,
): PurchaseIntent {
  return {
    intent_type: 'recipe_unlock',
    provider: 'supertab',
    user_id: userId,
    recipe_slug: access.recipeId,
    content_key: access.offering?.contentKey || `recipe:${access.recipeId}:cook`,
    price_amount: access.offering?.priceAmount ?? 0,
    currency_code: access.offering?.currencyCode || 'USD',
    mandate_id: mandateId ?? null,
    offer: {
      offering_id: offeringId ?? access.offering?.supertabOfferingId ?? null,
      onetime_offering_id: null,
    },
    metadata: {
      jamie_user_id: userId,
      recipe_id: access.recipeId,
      content_key: access.offering?.contentKey,
      source: 'agentic-commerce',
    },
  };
}

async function resolveRecipeOfferingId(
  client: SupertabClient,
  access: RecipeAccessResponse,
): Promise<string | null> {
  if (access.offering?.supertabOfferingId) {
    return access.offering.supertabOfferingId;
  }

  const configured = import.meta.env.VITE_SUPERTAB_RECIPE_OFFERING_ID;
  if (configured) {
    return configured;
  }

  if (!siteOfferingsCache) {
    const site = await client.api.retrieveSite();
    siteOfferingsCache = (site?.offerings || []).map((offering: any) => {
      const details = offering.entitlementDetails;
      const contentKey = Array.isArray(details)
        ? details[0]?.contentKey
        : details?.contentKey;
      return {
        id: offering.id,
        contentKey: contentKey ?? null,
        description: offering.description ?? null,
      };
    });
  }

  const contentKey = access.offering?.contentKey;
  if (contentKey) {
    const match = siteOfferingsCache.find((o) => o.contentKey === contentKey);
    if (match) {
      return match.id;
    }
  }

  const recipeOffering = siteOfferingsCache.find((o) =>
    o.description?.toLowerCase().includes('recipe'),
  );
  return recipeOffering?.id ?? siteOfferingsCache[0]?.id ?? null;
}

export async function ensureSpendMandateForAgenticPurchase(
  userId: string,
  access: RecipeAccessResponse,
  requestConsent?: PurchaseRecipeOptions['requestSpendMandateConsent'],
): Promise<string | null> {
  const price = access.offering?.priceAmount ?? 0;
  const currency = access.offering?.currencyCode || 'USD';
  const existing = await getCurrentSpendMandate(userId);
  if (existing && existing.remainingAmount >= price) {
    return existing.id;
  }

  const ceiling = Math.max(DEFAULT_AGENTIC_MANDATE_CEILING_CENTS, price);
  const approved = requestConsent
    ? await requestConsent({ ceilingAmount: ceiling, currencyCode: currency, priceAmount: price })
    : window.confirm(
        `Allow Jamie to add recipe unlocks to your Tab automatically this session (up to $${(ceiling / 100).toFixed(2)})?`,
      );
  if (!approved) {
    return null;
  }

  const mandate = await createSpendMandate({
    user_id: userId,
    ceiling_amount: ceiling,
    currency_code: currency,
    session_id: getSpendMandateSessionId(),
    source: 'voice',
  });
  return mandate.id;
}

export interface PurchaseRecipeOnTabResult {
  status: 'completed' | 'action_required' | 'unavailable' | 'abandoned' | 'prior-entitlement';
  userId?: string;
  refreshedAccess?: RecipeAccessResponse;
  purchase?: Record<string, unknown> | null;
  actionRequired?: boolean;
}

/**
 * Modal-free purchase via Supertab Customer API `api.purchase`.
 * Falls back to paywall when `actionRequired` is true.
 */
export async function purchaseRecipeOnTab(
  access: RecipeAccessResponse,
  options: PurchaseRecipeOptions = {},
): Promise<PurchaseRecipeOnTabResult> {
  if (!hasSupertabConfig() || !access.offering?.contentKey) {
    return { status: 'unavailable' };
  }

  const client = await getSupertabClient();
  const authStatus = await client.auth.status;
  if (authStatus !== 'valid') {
    const silent = await client.auth.start({ silently: true }).catch(() => null);
    if (!silent) {
      return { status: 'unavailable' };
    }
  }

  const userId = await ensureJamieSupertabUser();
  if (options.agentic) {
    const mandateId = await ensureSpendMandateForAgenticPurchase(
      userId,
      access,
      options.requestSpendMandateConsent,
    );
    if (!mandateId) {
      return { status: 'abandoned', userId };
    }
  }

  const offeringId = await resolveRecipeOfferingId(client, access);
  if (!offeringId) {
    return { status: 'unavailable', userId };
  }

  const customer = await client.api.retrieveCustomer().catch(() => null);
  const currencyCode = customer?.tab?.currency?.code || access.offering.currencyCode || 'USD';

  const entitlementCheck = await client.api
    .checkEntitlement({ contentKey: access.offering.contentKey })
    .catch(() => null);
  if (entitlementCheck?.hasEntitlement) {
    await syncSupertabPurchase({
      user_id: userId,
      recipe_id: access.recipeId,
      prior_entitlement: [{ contentKey: access.offering.contentKey, hasEntitlement: true }],
    });
    return {
      status: 'prior-entitlement',
      userId,
      refreshedAccess: await getRecipeAccess(access.recipeId, userId),
    };
  }

  const result = await client.api.purchase({
    offeringId,
    currencyCode,
    metadata: {
      jamieUserId: userId,
      recipeId: access.recipeId,
      contentKey: access.offering.contentKey,
      source: options.agentic ? 'agent-silent-tab' : 'jamie-on-tab',
    },
  });

  if (result?.actionRequired) {
    return { status: 'action_required', userId, actionRequired: true };
  }

  const purchase = result?.purchase ?? null;
  if (!purchase) {
    return { status: 'abandoned', userId };
  }

  await syncSupertabPurchase({
    user_id: userId,
    recipe_id: access.recipeId,
    purchase,
    prior_entitlement: [],
  });

  return {
    status: purchase.status === 'completed' ? 'completed' : 'abandoned',
    userId,
    purchase,
    refreshedAccess: await getRecipeAccess(access.recipeId, userId),
  };
}

async function buildResolutionFromPaywallResult(
  paywallResult: LaunchRecipePaywallResult,
): Promise<RecipePurchaseResolution | null> {
  if (paywallResult.status === 'unavailable' || paywallResult.status === 'abandoned') {
    return null;
  }

  const snapshot = await loadMyTabSnapshot();
  const priorEntitlements =
    paywallResult.status === 'prior-entitlement' ? [{ hasEntitlement: true }] : [];

  return {
    snapshot,
    refreshedAccess: paywallResult.refreshedAccess ?? null,
    state: {
      purchase: paywallResult.status === 'completed' ? { status: 'completed' } : undefined,
      priorEntitlement: priorEntitlements,
    },
    priorEntitlements,
  };
}

/**
 * Single purchase entry: silent on-tab first, then embedded button, then paywall fallback.
 * Voice and tap both call this instead of DOM click-walking.
 */
export async function purchaseRecipe(
  access: RecipeAccessResponse,
  options: PurchaseRecipeOptions = {},
): Promise<PurchaseRecipeOutcome> {
  const onTabResult = await purchaseRecipeOnTab(access, options);
  if (onTabResult.status === 'completed' || onTabResult.status === 'prior-entitlement') {
    const snapshot = await loadMyTabSnapshot();
    return {
      via: 'on_tab',
      resolution: {
        snapshot,
        refreshedAccess: onTabResult.refreshedAccess ?? null,
        state: {
          purchase: onTabResult.purchase || { status: 'completed' },
          priorEntitlement:
            onTabResult.status === 'prior-entitlement' ? [{ hasEntitlement: true }] : [],
        },
        priorEntitlements:
          onTabResult.status === 'prior-entitlement' ? [{ hasEntitlement: true }] : [],
      },
    };
  }

  if (onTabResult.status === 'abandoned' && options.agentic) {
    return { via: 'abandoned', resolution: null };
  }

  const canEmbed = canEmbedRecipePurchaseButton(access);

  if (canEmbed && options.openEmbeddedCheckout && options.waitForEmbeddedResolution) {
    await options.openEmbeddedCheckout();
    const resolution = await options.waitForEmbeddedResolution();
    if (resolution) {
      return { via: 'embedded', resolution };
    }
  }

  const paywallResult = await launchRecipePaywall(access);
  if (paywallResult.status === 'unavailable') {
    return { via: 'unavailable', resolution: null, paywallResult };
  }
  if (paywallResult.status === 'abandoned') {
    return { via: 'abandoned', resolution: null, paywallResult };
  }

  const resolution = await buildResolutionFromPaywallResult(paywallResult);
  return { via: 'paywall', resolution, paywallResult };
}

export async function launchRecipePaywall(access: RecipeAccessResponse): Promise<LaunchRecipePaywallResult> {
  const clientId = getClientId();
  const experienceId = getPaywallExperienceId(access);

  if (!clientId || !experienceId || !access.offering?.contentKey) {
    return { status: 'unavailable' };
  }

  const userId = await ensureJamieSupertabUser();
  const supertabClient = await getSupertabClient();
  const paywall = await supertabClient.createPaywall({
    experienceId,
    purchaseMetadata: {
      jamieUserId: userId,
      recipeId: access.recipeId,
      contentKey: access.offering.contentKey,
    },
  });

  const initialEntitlements = paywall.initialState?.priorEntitlement || [];
  const matchingInitialEntitlement = initialEntitlements.find(
    (entitlement: any) =>
      entitlement?.contentKey === access.offering?.contentKey && entitlement?.hasEntitlement
  );

  if (matchingInitialEntitlement) {
    await syncSupertabPurchase({
      user_id: userId,
      recipe_id: access.recipeId,
      prior_entitlement: initialEntitlements,
    });

    return {
      status: 'prior-entitlement',
      userId,
      refreshedAccess: await getRecipeAccess(access.recipeId, userId),
    };
  }

  const state = await paywall.show();

  if (!state?.purchase && !(state?.priorEntitlement || []).length) {
    return { status: 'abandoned', userId };
  }

  await syncSupertabPurchase({
    user_id: userId,
    recipe_id: access.recipeId,
    purchase: state.purchase || null,
    prior_entitlement: state.priorEntitlement || [],
  });

  return {
    status: state.purchase?.status === 'completed' ? 'completed' : 'abandoned',
    userId,
    refreshedAccess: await getRecipeAccess(access.recipeId, userId),
  };
}

export function getStoredJamieAccessUserId(): string | null {
  return getStoredJamieUserId();
}
