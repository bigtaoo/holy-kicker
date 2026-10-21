import { describe, expect, it } from 'vitest';
import { SWAY, easeLean, pushLean, windLean } from './sway';

describe('grass sway', () => {
  it('keeps the wind gentle', () => {
    for (let t = 0; t < 30; t += 0.13) {
      const l = Math.abs(windLean(t, t * 37, -t * 11));
      expect(l).toBeLessThanOrEqual(SWAY.breeze + SWAY.gust + 1e-9);
    }
  });

  it('leans away from the hero, most at his feet, not at all out of reach', () => {
    expect(pushLean(40, 0, 0, 0)).toBeGreaterThan(0);
    expect(pushLean(-40, 0, 0, 0)).toBeLessThan(0);
    expect(Math.abs(pushLean(20, 0, 0, 0))).toBeGreaterThan(Math.abs(pushLean(100, 0, 0, 0)));
    expect(pushLean(SWAY.reach + 1, 0, 0, 0)).toBe(0);
    expect(Math.abs(pushLean(0, 0, 0, 0))).toBeCloseTo(SWAY.push);
  });

  it('bends quickly and springs back slowly', () => {
    const bent = easeLean(0, 0.5, 0.05);
    const back = 0.5 - easeLean(0.5, 0, 0.05);
    expect(bent).toBeGreaterThan(back);
    expect(easeLean(0.3, 0, 10)).toBe(0);
  });
});
