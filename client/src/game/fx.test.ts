import { describe, expect, it } from 'vitest';
import { DOWN_MERGE, FX_TIER, FxPool, fxAlpha, fxCost, fxSize, type FxSpec } from './fx';

describe('FxPool', () => {
  it('emits a hit burst, moves it out and removes it when spent', () => {
    const pool = new FxPool(100, () => 0.5);
    pool.hit(0, 0);
    expect(pool.live.length).toBe(14);
    pool.step(0.1);
    const spark = pool.live.find((p) => p.shape === 'spark')!;
    expect(Math.hypot(spark.x, spark.y)).toBeGreaterThan(20);
    for (let i = 0; i < 10; i++) pool.step(0.1);
    expect(pool.live.length).toBe(0);
  });

  it('reuses spent particles', () => {
    const pool = new FxPool(100, () => 0.5);
    pool.puff(0, 0);
    const first = new Set(pool.live);
    pool.step(5);
    pool.puff(0, 0);
    expect(pool.live.every((p) => first.has(p) && p.age === 0)).toBe(true);
  });

  it('never grows past its cap, and keeps the last slots for must particles', () => {
    const pool = new FxPool(20);
    pool.hit(0, 0);
    pool.puff(0, 0);
    expect(pool.live.length).toBe(18);
    for (let i = 0; i < 5; i++) pool.emit(spec(10));
    expect(pool.live.length).toBe(20);
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

describe('mob down', () => {
  it('pops a ring and chips over the smoke', () => {
    const pool = new FxPool(100, () => 0.5);
    pool.down(0, 0);
    const shapes = pool.live.map((p) => p.shape);
    expect(shapes).toContain('ring');
    expect(shapes).toContain('spark');
    expect(shapes).toContain('puff');
  });
});

describe('fill budget', () => {
  it('tracks fill and drops optional particles over budget', () => {
    const pool = new FxPool(1000, () => 0.5, 20000);
    pool.hit(0, 0);
    expect(pool.fill).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) pool.puff(0, 0);
    expect(pool.fill).toBeLessThan(20000 + 110 * 110);
    expect(pool.dropped).toBeGreaterThan(0);
    pool.step(5);
    expect(pool.fill).toBe(0);
  });
});

function spec(size: number): FxSpec {
  return { shape: 'puff', x: 0, y: 0, vx: 0, vy: 0, life: 1, size0: size, size1: size, rotation: 0, spin: 0, drag: 1, color: 0, alpha: 1 };
}

describe('tiers', () => {
  it('a lesser tier gives way first as the budget fills', () => {
    const budget = fxCost(spec(100)) * 10;
    const pool = new FxPool(1000, () => 0.5, budget);
    let ambient = 0;
    let garnish = 0;
    let hero = 0;
    for (let i = 0; i < 20; i++) {
      if (pool.emit(spec(100), FX_TIER.ambient)) ambient++;
      if (pool.emit(spec(100), FX_TIER.garnish)) garnish++;
      if (pool.emit(spec(100), FX_TIER.hero)) hero++;
    }
    expect(ambient).toBeLessThan(garnish);
    expect(garnish).toBeLessThan(hero);
    expect(pool.fill).toBeLessThanOrEqual(budget);
    // must particles ignore the budget
    expect(pool.emit(spec(100))).toBe(true);
  });
});

describe('heat', () => {
  it('a hot battle gets a smaller hit and a smaller down', () => {
    const cold = new FxPool(1000, () => 0.5);
    const hot = new FxPool(1000, () => 0.5);
    hot.heat = 1;
    cold.hit(0, 0, 1, 0);
    hot.hit(0, 0, 1, 0);
    expect(hot.live.length).toBeLessThan(cold.live.length);
    expect(hot.fill).toBeLessThan(cold.fill / 2);
    cold.step(1);
    hot.step(1);
    cold.down(0, 0);
    hot.down(0, 0);
    expect(hot.live.length).toBeLessThan(cold.live.length);
  });

  it('sparks spray on along the blow', () => {
    const pool = new FxPool(1000, () => 0.5);
    pool.hit(0, 0, 1, 0);
    const sparks = pool.live.filter((p) => p.shape === 'spark');
    expect(sparks.filter((p) => p.vx > 0).length).toBeGreaterThan(sparks.length / 2);
  });

  it('a far kill shrinks only when hot', () => {
    const near = new FxPool(1000, () => 0.5);
    const far = new FxPool(1000, () => 0.5);
    near.heat = far.heat = 1;
    near.down(0, 0);
    far.down(2000, 0);
    expect(far.fill).toBeLessThan(near.fill);
  });
});

describe('merged downs', () => {
  it('a down right beside one just shown only adds smoke', () => {
    const pool = new FxPool(1000, () => 0.5);
    pool.down(0, 0);
    const first = pool.live.length;
    pool.down(DOWN_MERGE.dist / 2, 0);
    const added = pool.live.slice(first);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((p) => p.shape === 'puff')).toBe(true);
  });

  it('but not one far off, nor one a moment later', () => {
    const pool = new FxPool(1000, () => 0.5);
    pool.down(0, 0);
    let n = pool.live.length;
    pool.down(DOWN_MERGE.dist * 3, 0);
    expect(pool.live.slice(n).some((p) => p.shape === 'ring')).toBe(true);
    pool.step(DOWN_MERGE.time * 2);
    n = pool.live.length;
    pool.down(0, 0);
    expect(pool.live.slice(n).some((p) => p.shape === 'ring')).toBe(true);
  });
});

describe('dust', () => {
  it('kicks up behind the feet, and is the first to go on a full screen', () => {
    const pool = new FxPool(1000, () => 0.5);
    pool.dust(0, 0, 1);
    expect(pool.live.length).toBe(2);
    expect(pool.live.every((p) => p.x < 0 && p.vx < 0)).toBe(true);
    const full = new FxPool(1000, () => 0.5, fxCost(spec(100)));
    full.emit(spec(80), FX_TIER.hero);
    full.dust(0, 0, 1);
    expect(full.live.length).toBe(1);
  });
});
