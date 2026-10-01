import { describe, expect, it } from 'vitest';
import { FxPool } from './fx';
import { bolt, explosion, nova } from './spells';
import { AuraStack } from './aura';

describe('spells', () => {
  it('builds a band ring from segments that shade far less than one quad', () => {
    const band = new FxPool(1000);
    const quad = new FxPool(1000);
    nova(band, 0, 0, 60, 700, 0.45, 0xffffff, 'band');
    nova(quad, 0, 0, 60, 700, 0.45, 0xffffff, 'quad');
    expect(quad.live.length).toBe(1);
    expect(band.live.length).toBeGreaterThan(20);
    expect(band.fill).toBeLessThan(quad.fill / 5);
    band.step(0.4);
    const p = band.live[0];
    expect(Math.hypot(p.x, p.y)).toBeGreaterThan(550);
  });

  it('keeps an explosion core when over budget and drops its smoke', () => {
    const pool = new FxPool(1000, () => 0.5, 1);
    explosion(pool, () => 0.5, 0, 0, 220, 'band');
    expect(pool.live.some((p) => p.shape === 'glow')).toBe(true);
    expect(pool.live.some((p) => p.shape === 'puff')).toBe(false);
  });

  it('ends a bolt at its target', () => {
    const pool = new FxPool(100);
    bolt(pool, () => 0.5, 0, 0, 300, 0);
    expect(pool.live[pool.live.length - 1]).toMatchObject({ shape: 'glow', x: 300, y: 0 });
  });

  it('owns a halo and two orbs per aura layer', () => {
    const aura = new AuraStack(3);
    const pool = new FxPool(100);
    aura.update(0.1, 0, 0, pool);
    expect(aura.parts.length).toBe(3 * 20);
    expect(pool.live.length).toBe(6);
  });
});
