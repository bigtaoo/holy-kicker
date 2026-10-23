import { describe, expect, it } from 'vitest';
import { FxPool } from './fx';
import { BLAST, bladeTrail, bolt, explosion, nova, sealBurst } from './spells';
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
    const ground = new FxPool(1000, () => 0.5, 1);
    explosion(pool, ground, () => 0.5, 0, 0, 220, 'band');
    expect(pool.live.some((p) => p.shape === 'glow')).toBe(true);
    expect(ground.live.some((p) => p.shape === 'band')).toBe(true);
    expect(ground.live.some((p) => p.shape === 'puff')).toBe(false);
  });

  it('lays the light, ring and smoke of a blast under the figures, and only a small core and sparks over them', () => {
    const pool = new FxPool(1000);
    const ground = new FxPool(1000);
    explosion(pool, ground, () => 0.5, 0, 0, 280, 'band');
    expect(new Set(pool.live.map((p) => p.shape))).toEqual(new Set(['glow', 'spark']));
    expect(ground.live.filter((p) => p.shape === 'puff')).toHaveLength(BLAST.smoke[0]);
    const core = pool.live.find((p) => p.shape === 'glow')!;
    const light = ground.live.find((p) => p.shape === 'glow')!;
    // the core over the horde shades a small fraction of the light under it
    expect(core.cost).toBeLessThan(light.cost / 5);
  });

  it('gives a bomblet and a hot battle fewer sparks and less smoke', () => {
    const count = (heat: number, small: boolean) => {
      const pool = new FxPool(1000);
      const ground = new FxPool(1000);
      pool.heat = heat;
      explosion(pool, ground, () => 0.5, 0, 0, 280, 'band', 1, small);
      return { sparks: pool.live.filter((p) => p.shape === 'spark').length, smoke: ground.live.filter((p) => p.shape === 'puff').length };
    };
    expect(count(0, false)).toEqual({ sparks: BLAST.sparks[0], smoke: BLAST.smoke[0] });
    expect(count(1, false)).toEqual({ sparks: BLAST.sparks[1], smoke: BLAST.smoke[1] });
    expect(count(1, true).sparks).toBeLessThan(BLAST.sparks[1]);
    expect(count(1, true).smoke).toBeLessThan(BLAST.smoke[1]);
  });

  it('ends a bolt at its target', () => {
    const pool = new FxPool(100);
    bolt(pool, () => 0.5, 0, 0, 300, 0);
    expect(pool.live[pool.live.length - 1]).toMatchObject({ shape: 'glow', x: 300, y: 0 });
  });

  it('lays a seal burst light and ring on the ground, keeps its core over budget, and drops its scraps and the blade trails', () => {
    const pool = new FxPool(1000, () => 0.5, 1);
    const ground = new FxPool(1000);
    sealBurst(pool, ground, () => 0.5, 0, 0, 150, 'band', 50);
    bladeTrail(pool, 0, 0, 1);
    expect(ground.live.filter((p) => p.shape === 'band')).toHaveLength(28);
    expect(ground.live.some((p) => p.shape === 'glow')).toBe(true);
    expect(pool.live.filter((p) => p.shape === 'glow')).toMatchObject([{ y: -50 }]);
    expect(pool.live.some((p) => p.shape === 'spark' || p.shape === 'band')).toBe(false);
  });

  it('owns a halo and two orbs per aura layer', () => {
    const aura = new AuraStack(3);
    const pool = new FxPool(100);
    aura.update(0.1, 0, 0, pool);
    expect(aura.parts.length).toBe(3 * 20);
    expect(pool.live.length).toBe(6);
  });
});
