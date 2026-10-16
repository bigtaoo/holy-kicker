import { describe, expect, it } from 'vitest';
import { RECORD_BURST, popScale, rayAlpha, sparkAt, sparks } from './recordBurst';

describe('recordBurst', () => {
  it('pops the words in past full size and settles at 1', () => {
    expect(popScale(0)).toBe(0);
    const peak = Math.max(...[0.1, 0.15, 0.2, 0.25].map(popScale));
    expect(peak).toBeGreaterThan(1.1);
    expect(popScale(RECORD_BURST.pop)).toBe(1);
    expect(popScale(2)).toBe(1);
  });

  it('shows the rays only while the cheer runs, fading at the end', () => {
    expect(rayAlpha(0)).toBe(0);
    expect(rayAlpha(1)).toBe(1);
    expect(rayAlpha(RECORD_BURST.length - 0.5)).toBeCloseTo(0.5);
    expect(rayAlpha(RECORD_BURST.length)).toBe(0);
  });

  it('flies the sparks out in every direction, then they fall and fade', () => {
    const all = sparks();
    expect(all).toHaveLength(RECORD_BURST.sparks);
    expect(sparks()).toEqual(all);
    const at = all.map((s) => sparkAt(s, 0.3));
    expect(at.some((p) => p.x > 100) && at.some((p) => p.x < -100)).toBe(true);
    expect(at.some((p) => p.y < -100)).toBe(true);
    for (const s of all) expect(sparkAt(s, s.life).alpha).toBe(0);
    // gravity wins in the end
    const s = all[0];
    expect(sparkAt(s, s.life - 0.05).y).toBeGreaterThan(sparkAt(s, 0.2).y);
  });
});
