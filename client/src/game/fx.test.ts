import { describe, expect, it } from 'vitest';
import { FxPool, fxAlpha, fxSize } from './fx';

describe('FxPool', () => {
  it('emits a hit burst, moves it out and removes it when spent', () => {
    const pool = new FxPool(100, () => 0.5);
    pool.hit(0, 0);
    expect(pool.live.length).toBe(10);
    pool.step(0.1);
    const spark = pool.live.find((p) => p.shape === 'spark')!;
    expect(Math.hypot(spark.x, spark.y)).toBeGreaterThan(20);
    for (let i = 0; i < 10; i++) pool.step(0.1);
    expect(pool.live.length).toBe(0);
  });

  it('never grows past its cap', () => {
    const pool = new FxPool(12);
    pool.hit(0, 0);
    pool.puff(0, 0);
    expect(pool.live.length).toBe(12);
  });

  it('grows and fades a particle over its life', () => {
    const pool = new FxPool(10, () => 0.5);
    pool.puff(0, 0);
    const p = pool.live[0];
    const s0 = fxSize(p);
    expect(fxAlpha(p)).toBeCloseTo(p.alpha);
    pool.step(p.life * 0.9);
    expect(fxSize(p)).toBeGreaterThan(s0);
    expect(fxAlpha(p)).toBeLessThan(p.alpha * 0.3);
  });
});
