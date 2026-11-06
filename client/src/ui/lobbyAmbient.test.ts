import { describe, expect, it } from 'vitest';
import { LEAVES, MOTES, actDrift, breath, hop, share, speckAt, stageTint } from './lobbyAmbient';

describe('lobby ambient', () => {
  it('tints the corgi courtyard for the planet picked, the dune world and the monk not at all', () => {
    const blue = stageTint(true, 1);
    expect(blue & 0xff).toBeGreaterThan(blue >> 16);  // Frost Moon: more blue than red
    expect(stageTint(true, 6)).toBe(blue);  // the maps come round again each act
    expect(stageTint(true, 3)).toBe(0xffffff);
    expect(new Set([1, 2, 3, 4, 5].map((c) => stageTint(true, c))).size).toBe(5);
    for (const c of [1, 2, 4, 20]) expect(stageTint(false, c)).toBe(0xffffff);
  });

  it('changes the specks with the act of the next chapter', () => {
    expect(actDrift(false, 0)).toBe(LEAVES);
    expect(actDrift(false, 4)).toBe(LEAVES);
    expect(actDrift(true, 4)).toBe(MOTES);
    const [two, three, four, done] = [5, 10, 15, 20].map((cleared) => actDrift(false, cleared));
    expect(new Set([LEAVES, two, three, four]).size).toBe(4);
    expect(done).toBe(four);
    expect([two.shape, three.shape, four.shape]).toEqual(['mote', 'flake', 'leaf']);
  });

  it('keeps shares in [0, 1)', () => {
    for (let i = 0; i < 50; i++) for (let k = 0; k < 8; k++) {
      const s = share(i, k);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
  });

  it('moves leaves down and motes up', () => {
    const a = speckAt(LEAVES, 3, 1, 1080, 1500);
    const b = speckAt(LEAVES, 3, 1.1, 1080, 1500);
    expect(b.y).toBeGreaterThan(a.y);
    const c = speckAt(MOTES, 3, 1, 1080, 1500);
    const d = speckAt(MOTES, 3, 1.1, 1080, 1500);
    expect(d.y).toBeLessThan(c.y);
  });

  it('fades a speck out where its path wraps', () => {
    for (let t = 0; t < 60; t += 0.37) {
      const s = speckAt(LEAVES, 1, t, 1080, 1500);
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
      // nearly invisible whenever it is outside the box
      if (s.y < -20 || s.y > 1520) expect(s.alpha).toBeLessThan(0.5);
    }
  });

  it('keeps sizes and colours within the style', () => {
    for (let i = 0; i < 20; i++) {
      const s = speckAt(MOTES, i, 5, 1080, 1500);
      expect(s.size).toBeGreaterThanOrEqual(MOTES.size[0]);
      expect(s.size).toBeLessThanOrEqual(MOTES.size[1]);
      expect(MOTES.colors).toContain(s.color);
      expect(s.rotation).toBe(0);
    }
  });

  it('breathes around 1 and hops once', () => {
    const [x, y] = breath(0.6);
    expect(y).toBeGreaterThan(1);
    expect(x).toBeLessThan(1);
    expect(hop(0)).toBe(0);
    expect(hop(0.175)).toBeCloseTo(40);
    expect(hop(0.5)).toBe(0);
  });
});
