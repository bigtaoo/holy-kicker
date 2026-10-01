import { describe, expect, it } from 'vitest';
import { isqrt, muldiv, perTick, ticks, toFp } from './fixed';
import { Prng } from './prng';
import { atan2B, BRAD_QUARTER, cosB, degToBrad, sinB, TRIG_ONE } from './trig';

describe('fixed', () => {
  it('isqrt is the exact floor root, small and large', () => {
    for (let n = 0; n < 5000; n++) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
    for (const n of [2 ** 40 - 1, 2 ** 40, 10 ** 15 + 7, 2 ** 52 + 1]) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
  });

  it('converts configuration units', () => {
    expect(toFp(1.5)).toBe(1500);
    expect(perTick(420)).toBe(14000);
    expect(ticks(0.9)).toBe(27);
    expect(muldiv(-7, 3, 2)).toBe(-10);
  });
});

describe('trig', () => {
  it('matches Math.sin/cos to the table precision', () => {
    for (let b = 0; b < 65536; b += 97) {
      const a = (b / 65536) * Math.PI * 2;
      expect(Math.abs(sinB(b) - Math.sin(a) * TRIG_ONE)).toBeLessThanOrEqual(2);
      expect(Math.abs(cosB(b) - Math.cos(a) * TRIG_ONE)).toBeLessThanOrEqual(2);
    }
    expect(sinB(BRAD_QUARTER)).toBe(TRIG_ONE);
    expect(Object.is(sinB(32768), -0)).toBe(false);
  });

  it('atan2 inverts cos/sin within a few brads', () => {
    for (let b = 0; b < 65536; b += 211) {
      const back = atan2B(sinB(b) * 100, cosB(b) * 100);
      const diff = ((back - b + 98304) % 65536) - 32768;
      expect(Math.abs(diff)).toBeLessThan(40);
    }
    expect(atan2B(0, 0)).toBe(0);
    expect(degToBrad(90)).toBe(BRAD_QUARTER);
  });
});

describe('Prng', () => {
  it('repeats per seed and differs between seeds', () => {
    const a = new Prng(42);
    const b = new Prng(42);
    const c = new Prng(43);
    const xs = Array.from({ length: 20 }, () => a.int(1000));
    expect(Array.from({ length: 20 }, () => b.int(1000))).toEqual(xs);
    expect(Array.from({ length: 20 }, () => c.int(1000))).not.toEqual(xs);
  });

  it('spreads range() over its bounds', () => {
    const r = new Prng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.range(-3, 3);
      expect(v >= -3 && v <= 3).toBe(true);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });
});
