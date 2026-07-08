import { describe, expect, it } from 'vitest';
import {
  deriveUnlockStepFinalization,
  finalizeUnlockStep,
  type ProcessStep,
} from './ProcessCardTypes';

const mockFormatPrice = (amountCents: number, currencyCode: string) =>
  `${currencyCode}:${amountCents}`;

describe('deriveUnlockStepFinalization', () => {
  it('uses standing-approval copy for auto_charge', () => {
    expect(
      deriveUnlockStepFinalization({ auto_charge: true }, mockFormatPrice),
    ).toEqual({
      label: 'Putting it on your Tab — using your standing approval',
      status: 'done',
    });
  });

  it('appends formatted ceiling when mandate data is present', () => {
    expect(
      deriveUnlockStepFinalization(
        {
          auto_charge: true,
          mandate: { ceilingAmount: 1500, currencyCode: 'GBP' },
        },
        mockFormatPrice,
      ),
    ).toEqual({
      label: 'Putting it on your Tab — using your standing approval, up to GBP:1500',
      status: 'done',
    });
  });

  it('uses ask-path copy when auto_charge is false or absent', () => {
    expect(
      deriveUnlockStepFinalization({ auto_charge: false }, mockFormatPrice),
    ).toEqual({
      label: 'Asked to put it on your Tab',
      status: 'done',
    });
    expect(deriveUnlockStepFinalization(undefined, mockFormatPrice)).toEqual({
      label: 'Asked to put it on your Tab',
      status: 'done',
    });
  });
});

describe('finalizeUnlockStep', () => {
  const steps: ProcessStep[] = [
    {
      id: 'unlock-1',
      tool: 'request_supertab_unlock',
      label: 'Requesting to put it on your Tab',
      icon: 'unlock',
      status: 'executing',
    },
  ];

  it('finalizes the matching step by tool_call_id', () => {
    expect(
      finalizeUnlockStep(
        steps,
        'unlock-1',
        { auto_charge: false },
        mockFormatPrice,
      ),
    ).toEqual([
      {
        ...steps[0],
        label: 'Asked to put it on your Tab',
        status: 'done',
      },
    ]);
  });

  it('no-ops when tool_call_id is missing or unmatched', () => {
    expect(
      finalizeUnlockStep(steps, undefined, { auto_charge: true }, mockFormatPrice),
    ).toBe(steps);
    expect(
      finalizeUnlockStep(steps, 'other-id', { auto_charge: true }, mockFormatPrice),
    ).toBe(steps);
  });
});
