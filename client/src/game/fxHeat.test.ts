import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '@hk/engine';
import { FxHeat, HEAT, byHeat, ramp } from './fxHeat';

function run(h: FxHeat, seconds: number, hitsPerSecond: number, onScreen: number): void {
  // hits arrive in whole events: spread them over the ticks
  let owed = 0;
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    owed += hitsPerSecond / TICK_RATE;
    const n = Math.floor(owed);
    owed -= n;
    h.tick(n, onScreen);
  }
}

describe('ramp', () => {
  it('is 0 under lo, 1 over hi, monotonic between', () => {
    expect(ramp(0, 10, 20)).toBe(0);
    expect(ramp(25, 10, 20)).toBe(1);
    let last = 0;
    for (let v = 10; v <= 20; v++) {
      const r = ramp(v, 10, 20);
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it('byHeat blends the two ends', () => {
    expect(byHeat(0, 2, 10)).toBe(2);
    expect(byHeat(1, 2, 10)).toBe(10);
    expect(byHeat(0.5, 2, 10)).toBe(6);
  });
});

describe('FxHeat', () => {
  it('stays cold through an opening: a few hits, a modest crowd', () => {
    const h = new FxHeat();
    run(h, 30, 5, 40);
    expect(h.value).toBeLessThan(0.02);
  });

  it('runs hot late in a chapter', () => {
    const h = new FxHeat();
    run(h, 10, 90, 70);
    expect(h.value).toBeGreaterThan(0.9);
  });

  it('a full screen heats it even while little is hit', () => {
    const h = new FxHeat();
    run(h, 10, 2, HEAT.crowdHot);
    expect(h.value).toBeGreaterThan(0.9);
  });

  it('heats quicker than it cools', () => {
    const up = new FxHeat();
    run(up, 2, 200, 0);
    const down = new FxHeat();
    run(down, 10, 200, 0);
    run(down, 2, 0, 0);
    expect(up.value).toBeGreaterThan(0.5);
    // two quiet seconds after a hot stretch: still warm
    expect(down.value).toBeGreaterThan(0.5);
  });

  it('reset cools it at once', () => {
    const h = new FxHeat();
    run(h, 5, 200, 200);
    h.reset();
    expect(h.value).toBe(0);
  });
});
