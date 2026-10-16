import { describe, expect, it } from 'vitest';
import { LowHealth, type LowHealthBalance } from './lowHealth';

const CFG: LowHealthBalance = { percent: 30, hysteresis: 5, bpm: [60, 120] };
const DT = 1 / 60;

/** Beats over `seconds` of frames at `hp` of 100. */
function beats(w: LowHealth, hp: number, seconds: number, live = true): number {
  let n = 0;
  for (let i = 0; i < seconds * 60; i++) if (w.step(DT, hp, 100, live)) n++;
  return n;
}

describe('LowHealth', () => {
  it('stays off above the bar and turns on at it, with a beat right away', () => {
    const w = new LowHealth(CFG);
    expect(beats(w, 31, 2)).toBe(0);
    expect(w.on).toBe(false);
    expect(w.pulse).toBe(0);
    expect(w.step(DT, 30, 100, true)).toBe(true);
    expect(w.on).toBe(true);
  });

  it('keeps on just above the bar and goes off past the hysteresis', () => {
    const w = new LowHealth(CFG);
    w.step(DT, 20, 100, true);
    w.step(DT, 34, 100, true);
    expect(w.on).toBe(true);
    w.step(DT, 36, 100, true);
    expect(w.on).toBe(false);
    // and back on only at the bar again
    w.step(DT, 33, 100, true);
    expect(w.on).toBe(false);
  });

  it('beats faster the lower the hero is', () => {
    const near = new LowHealth(CFG);
    const low = new LowHealth(CFG);
    expect(beats(near, 30, 10)).toBeCloseTo(11, -1);
    expect(beats(low, 1, 10)).toBeGreaterThan(18);
    expect(low.rate()).toBeGreaterThan(near.rate());
  });

  it('is off when it does not apply: not live, or a downed hero', () => {
    const w = new LowHealth(CFG);
    expect(beats(w, 10, 2, false)).toBe(0);
    expect(w.on).toBe(false);
    w.step(DT, 10, 100, true);
    w.step(DT, 0, 100, true);
    expect(w.on).toBe(false);
  });

  it('fades the vignette in and out, pulsing within 0..1', () => {
    const w = new LowHealth(CFG);
    w.step(DT, 10, 100, true);
    const first = w.pulse;
    let peak = 0;
    let low = 1;
    for (let i = 0; i < 120; i++) {
      w.step(DT, 10, 100, true);
      peak = Math.max(peak, w.pulse);
      low = Math.min(low, w.pulse);
    }
    expect(first).toBeLessThan(peak);
    expect(peak).toBeLessThanOrEqual(1);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(peak);
    w.step(DT, 100, 100, true);
    expect(w.pulse).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) w.step(DT, 100, 100, true);
    expect(w.pulse).toBe(0);
  });

  it('resets at once', () => {
    const w = new LowHealth(CFG);
    beats(w, 10, 1);
    w.reset();
    expect(w.on).toBe(false);
    expect(w.pulse).toBe(0);
  });
});
