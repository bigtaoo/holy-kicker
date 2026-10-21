import { describe, expect, it } from 'vitest';
import { actOf, CHAPTERS, HARD, ladder, LADDER, mapOf, MAPS } from './chapters';

describe('the chapter ladder', () => {
  it('plays the maps in turn, an act per round', () => {
    expect([1, 5, 6, 10, 11, 20].map(mapOf)).toEqual([1, 5, 1, 5, 1, 5]);
    expect([1, 5, 6, 15, 16, 20].map(actOf)).toEqual([1, 1, 2, 3, 4, 4]);
    expect(CHAPTERS % MAPS).toBe(0);
  });

  it('has a step for every chapter, each harder than the one before on the same map', () => {
    for (const t of [LADDER.hp, LADDER.hurt, LADDER.foe]) {
      expect(t).toHaveLength(CHAPTERS);
      for (let c = MAPS + 1; c <= CHAPTERS; c++) expect(t[c - 1]).toBeGreaterThan(t[c - 1 - MAPS]);
    }
  });

  it('takes HARD percent more in hard mode', () => {
    expect(ladder(LADDER.hp, 1, false, HARD.hp)).toBe(100);
    expect(ladder(LADDER.hp, 1, true, HARD.hp)).toBe(HARD.hp);
    expect(ladder(LADDER.hp, 99, false, HARD.hp)).toBe(LADDER.hp[CHAPTERS - 1]);
  });
});
