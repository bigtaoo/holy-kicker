import { describe, expect, it } from 'vitest';
import { REVEAL, REVEALED, countUp, goalShare, partIn } from './resultsReveal';

describe('results reveal', () => {
  it('brings the parts in one after another', () => {
    expect(partIn(0, 0)).toBe(0);
    expect(partIn(REVEAL.fade, 0)).toBe(1);
    expect(partIn(REVEAL.step, 1)).toBe(0);
    expect(partIn(REVEAL.step + REVEAL.fade / 2, 1)).toBeCloseTo(0.5);
    expect(partIn(REVEALED, 3)).toBe(1);
  });

  it('counts the copper up from its part to the total', () => {
    expect(countUp(0, 2, 1000)).toBe(0);
    expect(countUp(2 * REVEAL.step, 2, 1000)).toBe(0);
    const mid = countUp(2 * REVEAL.step + REVEAL.count / 2, 2, 1000);
    expect(mid).toBeGreaterThan(500);
    expect(mid).toBeLessThan(1000);
    expect(countUp(REVEALED, 2, 1000)).toBe(1000);
  });

  it('fills the goal bar by the share of the way there', () => {
    expect(goalShare(29, { kind: 'shrine', wave: 35, n: 5 })).toBeCloseTo(29 / 34);
    expect(goalShare(29, { kind: 'record', wave: 29, n: 0 })).toBe(1);
  });
});
