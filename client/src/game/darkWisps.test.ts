import { describe, expect, it } from 'vitest';
import { WISP_RISE, WISPS, hazePulse, wispPose } from './darkWisps';

describe('dark wisps', () => {
  it('loops each wisp every rise', () => {
    for (let i = 0; i < WISPS; i++) {
      const a = wispPose(i, 0.3);
      const b = wispPose(i, 0.3 + WISP_RISE);
      expect(b.y).toBeCloseTo(a.y);
      expect(b.x).toBeCloseTo(a.x);
    }
  });

  it('rises above the feet and fades at both ends', () => {
    for (let k = 0; k < 40; k++) {
      const p = wispPose(k % WISPS, k * 0.13);
      expect(p.y).toBeLessThan(0);
      expect(p.y).toBeGreaterThanOrEqual(-1.1);
      expect(p.alpha).toBeGreaterThanOrEqual(0);
      expect(p.alpha).toBeLessThanOrEqual(1);
    }
    expect(wispPose(0, 0).alpha).toBeCloseTo(0);
  });

  it('spreads wisps out over the loop', () => {
    const ys = Array.from({ length: WISPS }, (_, i) => wispPose(i, 0).y);
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBe(WISPS);
  });

  it('breathes between 0 and 1', () => {
    for (let k = 0; k < 30; k++) {
      const v = hazePulse(k * 0.11);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
