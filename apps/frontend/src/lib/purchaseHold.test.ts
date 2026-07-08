import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseHold } from './api';
import { msUntilHoldExpiry, parsePurchaseHold } from './purchaseHold';

const validHold: PurchaseHold = {
  id: 'hold-1',
  userId: 'user-1',
  sessionId: 'session-1',
  backendRecipeId: 'fish-pie',
  priceAmount: 500,
  currencyCode: 'USD',
  status: 'holding',
  askId: 'ask-1',
  mandateId: 'mandate-1',
  holdExpiresAt: '2099-01-01T00:00:00.000Z',
  committedAt: null,
  undoneAt: null,
  purchaseId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('parsePurchaseHold', () => {
  it('returns a hold for a valid shape', () => {
    expect(parsePurchaseHold(validHold)).toEqual(validHold);
  });

  it('returns null when a required field is missing', () => {
    const { id: _id, ...withoutId } = validHold;
    expect(parsePurchaseHold(withoutId)).toBeNull();
  });

  it('returns null for wrong field types', () => {
    expect(parsePurchaseHold({ ...validHold, priceAmount: '500' })).toBeNull();
    expect(parsePurchaseHold({ ...validHold, status: 'pending' })).toBeNull();
  });

  it('returns null for non-objects', () => {
    expect(parsePurchaseHold(null)).toBeNull();
    expect(parsePurchaseHold('hold')).toBeNull();
  });
});

describe('msUntilHoldExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns remaining ms for a future timestamp', () => {
    const hold: PurchaseHold = {
      ...validHold,
      holdExpiresAt: '2026-01-01T00:00:30.000Z',
    };
    expect(msUntilHoldExpiry(hold)).toBe(30_000);
  });

  it('returns 0 for a past timestamp', () => {
    const hold: PurchaseHold = {
      ...validHold,
      holdExpiresAt: '2025-12-31T23:59:00.000Z',
    };
    expect(msUntilHoldExpiry(hold)).toBe(0);
  });

  it('returns 0 for missing or invalid timestamps', () => {
    expect(msUntilHoldExpiry({ ...validHold, holdExpiresAt: null })).toBe(0);
    expect(msUntilHoldExpiry({ ...validHold, holdExpiresAt: 'not-a-date' })).toBe(0);
  });
});
