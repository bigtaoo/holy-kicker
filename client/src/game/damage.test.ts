import { describe, expect, it } from 'vitest';
import { DAMAGE_LIFE, DamagePool, KEY_MERGE_GAP, MERGE_AGE, MERGE_CELL, damageAlpha, damageScale, digitsOf, heroClear } from './damage';

describe('digitsOf', () => {
  it('splits a rounded value into digits', () => {
    expect(digitsOf(1207)).toEqual([1, 2, 0, 7]);
    expect(digitsOf(9.6)).toEqual([1, 0]);
    expect(digitsOf(-3)).toEqual([0]);
    const out = [7, 7, 7, 7, 7];
    expect(digitsOf(30, out)).toBe(out);
    expect(out).toEqual([3, 0]);
  });
});

describe('DamagePool', () => {
  it('rises, pops in, fades and expires', () => {
    const pool = new DamagePool(10, () => 0.5);
    pool.spawn(0, 0, 42, false);
    const d = pool.live[0];
    expect(damageScale(d)).toBeCloseTo(1.8);
    pool.step(0.2);
    expect(d.y).toBeLessThan(-50);
    expect(damageScale(d)).toBe(1);
    expect(damageAlpha(d)).toBe(1);
    pool.step(DAMAGE_LIFE * 0.9 - 0.2);
    expect(damageAlpha(d)).toBeLessThan(0.3);
    pool.step(0.1);
    expect(pool.live.length).toBe(0);
  });

  it('reuses expired numbers', () => {
    const pool = new DamagePool(10, () => 0.5);
    pool.spawn(0, 0, 123, false);
    const d = pool.live[0];
    pool.step(DAMAGE_LIFE);
    pool.spawn(5, 0, 9, true);
    expect(pool.live[0]).toBe(d);
    expect(d.digits).toEqual([9]);
    expect(d.age).toBe(0);
    expect(d.crit).toBe(true);
  });

  it('draws crits bigger and respects its cap', () => {
    const pool = new DamagePool(2, () => 0.5);
    pool.spawn(0, 0, 1, true);
    pool.spawn(MERGE_CELL * 2, 0, 1, false);
    pool.spawn(MERGE_CELL * 4, 0, 1, false);
    expect(pool.live.length).toBe(2);
    pool.step(0.5);
    expect(damageScale(pool.live[0])).toBeGreaterThan(damageScale(pool.live[1]));
  });

  it('adds up hits that land together into one number', () => {
    const pool = new DamagePool(10, () => 0.5);
    pool.spawn(10, 10, 12, false);
    pool.spawn(30, 40, 30, true);
    expect(pool.live.length).toBe(1);
    expect(pool.live[0].digits).toEqual([4, 2]);
    expect(pool.live[0].crit).toBe(true);
    pool.spawn(10 + MERGE_CELL, 10, 5, false);
    expect(pool.live.length).toBe(2);
    pool.step(MERGE_AGE);
    pool.spawn(10, 10, 5, false);
    expect(pool.live.length).toBe(3);
  });

  it('gathers repeated hits on a surviving target', () => {
    const pool = new DamagePool(10, () => 0.5);
    pool.spawn(0, 0, 10, false, 7);
    pool.step(KEY_MERGE_GAP * 0.8);
    pool.spawn(500, 0, 15, false, 7);
    expect(pool.live.length).toBe(1);
    const d = pool.live[0];
    expect(d.digits).toEqual([2, 5]);
    expect(d.age).toBe(0);
    expect(d.x).toBeCloseTo(500);
    // a mob hit beside it does not join the target's number, nor does another target
    pool.spawn(500, 0, 1, false);
    pool.spawn(500, 0, 1, false, 8);
    expect(pool.live.length).toBe(3);
    pool.step(KEY_MERGE_GAP);
    pool.spawn(500, 0, 1, false, 7);
    expect(pool.live.length).toBe(4);
  });
});

describe('heroClear', () => {
  it('fades numbers over the hero and leaves the rest solid', () => {
    expect(heroClear(0, -60, 0, 0)).toBeCloseTo(0.3);
    expect(heroClear(200, -60, 0, 0)).toBe(1);
    expect(heroClear(0, -300, 0, 0)).toBe(1);
    expect(heroClear(0, 50, 0, 0)).toBe(1);
    const edge = heroClear(90, -60, 0, 0);
    expect(edge).toBeGreaterThan(0.3);
    expect(edge).toBeLessThan(1);
  });
});
