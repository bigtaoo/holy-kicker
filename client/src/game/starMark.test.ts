import { describe, expect, it } from 'vitest';
import { BALANCE } from '../meta/balance';
import { MARK_FADE, starMarkAlpha, starMarkAt } from './starMark';

describe('starMarkAt', () => {
  it('marks normal chapter runs only', () => {
    expect(starMarkAt({ waves: 50 })).toBe(BALANCE.stars.lowest);
    expect(starMarkAt({ waves: 50, hard: true })).toBeNull();
    expect(starMarkAt({ waves: 50, mutator: 'swarm' })).toBeNull();
    expect(starMarkAt({ waves: 0 })).toBeNull();
  });
});

describe('starMarkAlpha', () => {
  it('stays lit while the lowest health holds the threshold', () => {
    expect(starMarkAlpha(1, 0.1, 50, 50)).toBe(1);
  });
  it('fades out once the lowest health went under, and stays out', () => {
    let a = 1;
    a = starMarkAlpha(a, MARK_FADE / 2, 49, 50);
    expect(a).toBeCloseTo(0.5);
    a = starMarkAlpha(a, MARK_FADE, 49, 50);
    expect(a).toBe(0);
    expect(starMarkAlpha(a, 1, 0, 50)).toBe(0);
  });
});
