import { describe, expect, it } from 'vitest';
import { flashAlpha, flashGrow, heatAlpha, heatSize, taper, TrailHistory } from './ballTrail';

const out = new Float64Array(32);

describe('TrailHistory', () => {
  it('reads nothing back while empty', () => {
    expect(new TrailHistory().sample(1, 0.1, 5, out)).toBe(0);
  });

  it('reads points at even ages behind a ball moving at constant speed', () => {
    const h = new TrailHistory();
    // 1000 units per second along x, a sample every 1/60 s
    for (let i = 0; i <= 12; i++) h.push(i * (1000 / 60), 0, i / 60);
    const now = 12 / 60;
    expect(h.sample(now, 0.1, 5, out)).toBe(5);
    const xs = [out[0], out[2], out[4], out[6], out[8]];
    expect(xs[0]).toBeCloseTo(200);
    expect(xs[1]).toBeCloseTo(175);
    expect(xs[4]).toBeCloseTo(100);
  });

  it('ends a young trail at its first sample', () => {
    const h = new TrailHistory();
    h.push(0, 0, 0);
    h.push(10, 0, 0.02);
    const n = h.sample(0.02, 0.1, 6, out);
    expect(n).toBeLessThan(6);
    expect(out[0]).toBe(10);
    expect(out[2 * (n - 1)]).toBe(0);
  });

  it('shrinks into the last point once the ball is gone', () => {
    const h = new TrailHistory();
    for (let i = 0; i <= 10; i++) h.push(i * 10, 0, i / 60);
    const last = 10 / 60;
    // well after the last sample, every point is the last position
    const n = h.sample(last + 0.2, 0.1, 4, out);
    expect(n).toBe(4);
    for (let k = 0; k < n; k++) expect(out[2 * k]).toBe(100);
    expect(h.newest).toBe(last);
  });

  it('moves the newest sample until it is a 120 Hz frame past the one before', () => {
    const h = new TrailHistory();
    h.push(0, 0, 0);
    h.push(1, 0, 0.1);
    h.push(2, 0, 0.101);
    h.push(3, 0, 0.102);
    expect(h.size).toBe(3);
    h.sample(0.102, 0, 1, out);
    expect(out[0]).toBe(3);
  });

  it('keeps only the newest samples when full', () => {
    const h = new TrailHistory(4);
    for (let i = 0; i < 10; i++) h.push(i, 0, i / 10);
    expect(h.size).toBe(4);
    const n = h.sample(0.9, 1, 11, out);
    expect(out[2 * (n - 1)]).toBe(6);
  });

  it('starts over after clear', () => {
    const h = new TrailHistory();
    h.push(5, 5, 1);
    h.clear();
    expect(h.size).toBe(0);
    expect(h.newest).toBe(-Infinity);
  });
});

describe('heat', () => {
  it('is a touch over full in the opening and 0.6 late, never off', () => {
    expect(heatSize(0)).toBeCloseTo(1.15);
    expect(heatSize(1)).toBeCloseTo(0.6);
    expect(heatAlpha(0)).toBe(1);
    expect(heatAlpha(1)).toBeCloseTo(0.6);
    expect(heatSize(5)).toBeCloseTo(0.6);
    expect(heatAlpha(-1)).toBe(1);
  });
});

describe('taper and flash', () => {
  it('thins the trail toward its tail', () => {
    expect(taper(0, 4)).toBeGreaterThan(taper(3, 4));
    expect(taper(3, 4)).toBeGreaterThan(0);
    expect(taper(0, 0)).toBe(0);
  });

  it('grows the flash and fades it out over its life', () => {
    expect(flashGrow(0)).toBeCloseTo(0.55);
    expect(flashGrow(1)).toBeCloseTo(1.2);
    expect(flashGrow(0.5)).toBeGreaterThan(0.875);
    expect(flashAlpha(0)).toBe(1);
    expect(flashAlpha(1)).toBe(0);
  });
});
