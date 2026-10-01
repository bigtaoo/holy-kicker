import { describe, expect, it } from 'vitest';
import { DropField, OVERFLOW_TIER, tierOf, type DropParams } from './drops';

const P: DropParams = { cell: 80, max: 3, magnet: 200, pickup: 40 };

/** Steps until nothing is flying (or a time limit), returns the seconds taken. */
function settle(f: DropField, hx: number, hy: number): number {
  let t = 0;
  while (f.gems.some((g) => g.flying) && t < 5) {
    f.step(1 / 60, hx, hy);
    t += 1 / 60;
  }
  return t;
}

describe('tierOf', () => {
  it('grows the look with the value', () => {
    expect([1, 9, 10, 49, 50, 500].map(tierOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('DropField', () => {
  it('merges drops on one cell into one bigger gem', () => {
    const f = new DropField(P);
    for (let i = 0; i < 12; i++) f.drop(1205 + i * 5, 1000, 1);
    expect(f.gems.length).toBe(1);
    expect(f.gems[0].value).toBe(12);
    expect(f.gems[0].tier).toBe(1);
    f.drop(1290, 1000, 1);
    expect(f.gems.length).toBe(2);
  });

  it('sends drops past the cap to one overflow gem', () => {
    const f = new DropField(P);
    for (let i = 0; i < 6; i++) f.drop(1000 + i * 100, 1000, 2);
    expect(f.restingCount).toBe(3);
    expect(f.gems.length).toBe(4);
    const o = f.gems.find((g) => g.tier === OVERFLOW_TIER)!;
    expect(o.value).toBe(6);
  });

  it('pulls gems in the magnet radius to the hero and collects them', () => {
    const f = new DropField(P);
    f.drop(150, 0, 3);
    f.drop(600, 0, 5);
    f.step(1 / 60, 0, 0);
    expect(f.gems.filter((g) => g.flying).length).toBe(1);
    expect(settle(f, 0, 0)).toBeLessThan(1);
    expect(f.collected).toBe(3);
    expect(f.gems.length).toBe(1);
    expect(f.restingCount).toBe(1);
  });

  it('catches up with a running hero', () => {
    const f = new DropField(P);
    f.drop(150, 0, 1);
    let hx = 0;
    for (let t = 0; t < 2 && f.collected === 0; t += 1 / 60) {
      hx -= 420 / 60;
      f.step(1 / 60, hx, 0);
    }
    expect(f.collected).toBe(1);
  });

  it('vacuums the whole map, overflow gem included, and frees the cells', () => {
    const f = new DropField(P);
    for (let i = 0; i < 6; i++) f.drop(1000 + i * 300, 0, 1);
    f.attractAll(0, 0);
    settle(f, 0, 0);
    expect(f.collected).toBe(6);
    expect(f.gems.length).toBe(0);
    expect(f.restingCount).toBe(0);
    // freed gems are reused and merging starts over
    f.drop(1000, 0, 1);
    f.drop(1000, 0, 1);
    expect(f.gems.length).toBe(1);
    expect(f.gems[0].value).toBe(2);
  });
});
