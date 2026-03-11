import { loadSupertab } from '@getsupertab/supertab-js';
import {
  bootstrapSupertabIdentity,
  getRecipeAccess,
  syncSupertabPurchase,
  type RecipeAccessResponse,
} from './api';

const JAMIE_USER_ID_KEY = 'jamie-supertab-user-id';
const JAMIE_SUBJECT_ID_KEY = 'jamie-supertab-subject-id';

type SupertabClient = InstanceType<(Awaited<ReturnType<typeof loadSupertab>>)['Supertab']>;
type RawSupertabCustomer = Awaited<ReturnType<SupertabClient['api']['retrieveCustomer']>>;
type RawSupertabCustomerUser = NonNullable<RawSupertabCustomer['user']>;
type RawSupertabSite = Awaited<ReturnType<SupertabClient['api']['retrieveSite']>>;
type SupertabPurchaseButtonState = Awaited<ReturnType<SupertabClient['createPurchaseButton']>>['initialState'];

let supertabClientPromise: Promise<SupertabClient> | null = null;

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
}

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

export async function mountRecipePurchaseButton({
  containerElement,
  access,
  onResolved,
  onError,
}: MountRecipePurchaseButtonOptions): Promise<{ destroy: () => void }> {
  const client = await getSupertabClient();
  const experienceId = getPurchaseButtonExperienceId();

  if (!experienceId) {
    onError?.('Add the Supertab purchase button experience ID to enable recipe unlocks.');
    return { destroy: () => undefined };
  }

  if (!access.offering?.contentKey) {
    onError?.('This recipe is missing a Supertab content key, so the purchase button cannot load.');
    return { destroy: () => undefined };
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
  });

  if ('initialState' in button && button.initialState) {
    void resolvePurchaseOutcome(access, button.initialState, onResolved).catch((error) => {
      console.error('Failed to process Supertab initial purchase state:', error);
    });
  }

  return {
    destroy: button.destroy,
  };
}

export interface LaunchRecipePaywallResult {
  status: 'completed' | 'abandoned' | 'prior-entitlement' | 'unavailable';
  userId?: string;
  refreshedAccess?: RecipeAccessResponse;
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
