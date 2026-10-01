import { describe, expect, it } from 'vitest';
import { ease, faceSide, snapToPixel } from './camera';

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
