import { describe, expect, it } from 'vitest';
import { DAMAGE_LIFE, DamagePool, damageAlpha, damageScale, digitsOf } from './damage';

describe('digitsOf', () => {
  it('splits a rounded value into digits', () => {
    expect(digitsOf(1207)).toEqual([1, 2, 0, 7]);
    expect(digitsOf(9.6)).toEqual([1, 0]);
    expect(digitsOf(-3)).toEqual([0]);
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

  it('draws crits bigger and respects its cap', () => {
    const pool = new DamagePool(2, () => 0.5);
    pool.spawn(0, 0, 1, true);
    pool.spawn(0, 0, 1, false);
    pool.spawn(0, 0, 1, false);
    expect(pool.live.length).toBe(2);
    pool.step(0.5);
    expect(damageScale(pool.live[0])).toBeGreaterThan(damageScale(pool.live[1]));
  });
});
