import { describe, expect, it } from 'vitest';
import { ease, faceSide, snapToPixel, periodStart, wrapNear } from './camera';

describe('ease', () => {
  it('jumps straight there without easing', () => {
    const v = { x: 0, y: 0 };
    ease(v, 10, -4, 1 / 60, 0);
    expect(v).toEqual({ x: 10, y: -4 });
  });

  it('covers ~63% in one time constant, whatever the frame rate', () => {
    for (const fps of [30, 60, 120]) {
      const v = { x: 0, y: 0 };
      for (let i = 0; i < fps * 0.1; i++) ease(v, 100, 0, 1 / fps, 0.1);
      expect(v.x).toBeCloseTo(63.2, 0);
    }
  });

  it('never overshoots on a long frame', () => {
    const v = { x: 0, y: 0 };
    ease(v, 100, 0, 5, 0.1);
    expect(v.x).toBeLessThanOrEqual(100);
    expect(v.x).toBeGreaterThan(99);
  });
});

describe('snapToPixel', () => {
  it('rounds to device pixels', () => {
    expect(snapToPixel(10.3, 1)).toBe(10);
    expect(snapToPixel(10.3, 2)).toBe(10.5);
  });
});

describe('faceSide', () => {
  it('keeps its side inside the dead zone and turns outside it', () => {
    expect(faceSide(1, -10, 30)).toBe(1);
    expect(faceSide(-1, 10, 30)).toBe(-1);
    expect(faceSide(1, -31, 30)).toBe(-1);
    expect(faceSide(-1, 31, 30)).toBe(1);
  });
});

describe('periodStart', () => {
  it('snaps down to whole periods, below zero too', () => {
    expect(periodStart(950, 300)).toBe(900);
    expect(periodStart(-10, 300)).toBe(-300);
  });
});

describe('wrapNear', () => {
  it('moves a point by whole periods to within half a period of the centre', () => {
    expect(wrapNear(100, 0, 8000)).toBe(100);
    expect(wrapNear(-3900, 5000, 8000)).toBe(4100);
    expect(wrapNear(3900, -5000, 8000)).toBe(-4100);
    const x = wrapNear(1234, 98765, 8000);
    expect(Math.abs(x - 98765)).toBeLessThanOrEqual(4000);
    expect((x - 1234) % 8000).toBe(0);
  });
});
