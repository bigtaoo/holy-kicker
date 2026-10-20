import { TICK_RATE } from '@hk/engine';
import { describe, expect, it } from 'vitest';
import { guardAlpha } from './guardPulse';

describe('guardAlpha', () => {
  it('is fully opaque without a guard', () => {
    expect(guardAlpha(0, 0)).toBe(1);
    expect(guardAlpha(1, 1)).toBe(1);
  });

  it('dims softly while the guard runs and never below 0.55', () => {
    let min = 1;
    for (let cd = 1; cd <= TICK_RATE; cd++) for (const a of [0, 0.25, 0.5, 0.75]) min = Math.min(min, guardAlpha(cd, a));
    expect(min).toBeLessThan(0.6);
    expect(min).toBeGreaterThanOrEqual(0.55 - 1e-9);
  });

  it('eases back to full opacity as the guard ends', () => {
    expect(guardAlpha(1, 0.9)).toBeGreaterThan(0.99);
  });
});
