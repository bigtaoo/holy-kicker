import { describe, expect, it } from 'vitest';
import { ThreatField, type ThreatParams } from './threats';

const P: ThreatParams = {
  rate: 1, fan: 3, bulletSpeed: 400, bulletLife: 4, hitRadius: 40, range: 900,
  zoneRate: 0, zoneRadius: 150, warn: 1, zoneSpread: 0,
};

function run(f: ThreatField, seconds: number, hx: number, hy: number, mobs = [{ x: 400, y: 0 }]): number {
  let hits = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    f.step(1 / 60, hx, hy, mobs);
    hits += f.hits;
  }
  return hits;
}

describe('ThreatField', () => {
  it('fires a fan from a mob in range, and its middle bullet hits a standing hero', () => {
    const f = new ThreatField({ ...P, rate: 0.5 });
    f.step(1 / 60, 0, 0, [{ x: 400, y: 0 }]);
    expect(f.bullets.length).toBe(3);
    expect(run(f, 1.2, 0, 0)).toBe(1);
    expect(f.bullets.length).toBe(2);
  });

  it('ignores mobs out of range', () => {
    const f = new ThreatField(P);
    run(f, 2, 0, 0, [{ x: 2000, y: 0 }]);
    expect(f.bullets.length).toBe(0);
  });

  it('expires bullets', () => {
    const f = new ThreatField({ ...P, rate: 0.1, fan: 1 });
    run(f, 0.1, 0, 0, [{ x: 400, y: 0 }]);
    // the hero steps aside: the bullet flies on and expires
    run(f, 5, 0, 500, []);
    expect(f.bullets.length).toBe(0);
  });

  it('blasts a zone after the warning, hurting the hero only inside it', () => {
    const f = new ThreatField({ ...P, rate: 0, zoneRate: 0.5 });
    expect(run(f, 0.9, 0, 0, [])).toBe(0);
    expect(f.zones.length).toBe(1);
    expect(run(f, 0.2, 0, 0, [])).toBe(1);
    expect(f.zones.length).toBe(0);
    const g = new ThreatField({ ...P, rate: 0, zoneRate: 0.5 });
    expect(run(g, 1.1, 0, 0, [])).toBe(1);
    const h = new ThreatField({ ...P, rate: 0, zoneRate: 0.5 });
    h.step(1 / 60, 0, 0, []);
    expect(run(h, 1.1, 300, 0, [])).toBe(0);
  });
});
