import { describe, expect, it } from 'vitest';
import { computeViewport, DESIGN_H, DESIGN_W, ZOOM_AT_WIDEST } from './viewport';

describe('computeViewport', () => {
  it('shows exactly the design size on a 9:16 phone', () => {
    const v = computeViewport(1080, 1920);
    expect(v.viewW).toBeCloseTo(DESIGN_W);
    expect(v.viewH).toBeCloseTo(DESIGN_H);
    expect(v.scale).toBeCloseTo(1);
    expect([v.playX, v.playY, v.playW, v.playH]).toEqual([0, 0, 1080, 1920]);
  });

  it('keeps the width and shows more height on a tall phone', () => {
    const v = computeViewport(390, 844);
    expect(v.viewW).toBeCloseTo(DESIGN_W);
    expect(v.viewH).toBeGreaterThan(DESIGN_H);
    expect(v.playW).toBe(390);
  });

  it('pillarboxes a 16:9 desktop iframe to 3:4 and zooms in', () => {
    const v = computeViewport(821, 462);
    expect(v.playH).toBe(462);
    expect(v.playW).toBeCloseTo(462 * 0.75);
    expect(v.playX).toBeCloseTo((821 - 462 * 0.75) / 2);
    expect(v.viewH).toBeCloseTo(DESIGN_H / ZOOM_AT_WIDEST);
    // a 120-unit hero stays readable
    expect(120 * v.scale).toBeGreaterThan(35);
  });

  it('is continuous at the phone aspect', () => {
    const a = computeViewport(1080, 1920);
    const b = computeViewport(1081, 1920);
    // one extra pixel of width may only nudge the view, never jump it
    expect(Math.abs(b.viewH - a.viewH)).toBeLessThan(5);
  });

  it('letterboxes an extremely tall screen', () => {
    const v = computeViewport(100, 1000);
    expect(v.playW).toBe(100);
    expect(v.playH).toBeLessThan(1000);
    expect(v.playY).toBeGreaterThan(0);
  });
});
