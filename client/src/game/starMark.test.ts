import { describe, expect, it } from 'vitest';
import { BALANCE } from '../meta/balance';
import { RIM_FADE, starRimAlpha, starMarkAt } from './starMark';

describe('starMarkAt', () => {
  it('marks normal chapter runs only', () => {
    expect(starMarkAt({ waves: 50 })).toBe(BALANCE.stars.lowest);
    expect(starMarkAt({ waves: 50, hard: true })).toBeNull();
    expect(starMarkAt({ waves: 50, mutator: 'swarm' })).toBeNull();
    expect(starMarkAt({ waves: 0 })).toBeNull();
  });
});

describe('starRimAlpha', () => {
  it('stays lit while the lowest health holds the threshold', () => {
    expect(starRimAlpha(1, 0.1, 50, 50)).toBe(1);
  });
  it('fades out once the lowest health went under, and stays out', () => {
    let a = 1;
    a = starRimAlpha(a, RIM_FADE / 2, 49, 50);
    expect(a).toBeCloseTo(0.5);
    a = starRimAlpha(a, RIM_FADE, 49, 50);
    expect(a).toBe(0);
    expect(starRimAlpha(a, 1, 0, 50)).toBe(0);
  });
});
