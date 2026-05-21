import { describe, expect, it } from 'vitest';

import { getStepDisplayTitle } from './recipeStepTitle';

describe('getStepDisplayTitle', () => {
  it('keeps a strong authored step description', () => {
    expect(
      getStepDisplayTitle({
        descr: 'Chop the mint leaves',
        instructions: 'Chop the mint leaves and scatter them over the salad.',
        stepNumber: 2,
      }),
    ).toBe('Chop the mint leaves');
  });

  it('derives a cleaner title from truncated descriptions', () => {
    expect(
      getStepDisplayTitle({
        descr: 'Peel and finely slice the garlic, then add it to the pan...',
        instructions: 'Peel and finely slice the garlic, then add it to the pan with a splash of olive oil.',
        stepNumber: 1,
      }),
    ).toBe('Peel and finely slice the garlic');
  });

  it('derives a title from instructions when description is weak', () => {
    expect(
      getStepDisplayTitle({
        descr: 'S',
        instructions: 'Stir the sauce for 10 minutes until thick and glossy.',
        stepNumber: 3,
      }),
    ).toBe('Stir the sauce for 10 minutes');
  });

  it('falls back to step number when no text exists', () => {
    expect(getStepDisplayTitle({ stepNumber: 4 })).toBe('Step 4');
  });
});

