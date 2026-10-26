import { describe, expect, it } from 'vitest';
import { computeViewport, DESIGN_H, DESIGN_W, wantsUpright, WIDE_MAX_ASPECT, WIDE_MIN_ASPECT, WIDE_VIEW_H, wideScreen, ZOOM_AT_WIDEST } from './viewport';

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

  it('fills a 16:9 screen on a landscape run, about 2130x1200 of world', () => {
    const v = computeViewport(1920, 1080, true);
    expect([v.playX, v.playY, v.playW, v.playH]).toEqual([0, 0, 1920, 1080]);
    expect(v.viewH).toBe(WIDE_VIEW_H);
    expect(v.viewW).toBeCloseTo(WIDE_VIEW_H * (16 / 9));
    // a 120-unit hero on a 900 px tall screen
    expect(120 * computeViewport(1600, 900, true).scale).toBe(90);
  });

  it('keeps a landscape run between 16:10 and 16:9, boxing the rest', () => {
    const square = computeViewport(1000, 1000, true);
    expect(square.playW).toBe(1000);
    expect(square.playH).toBeCloseTo(1000 / WIDE_MIN_ASPECT);
    expect(square.playY).toBeGreaterThan(0);
    const ultra = computeViewport(3440, 1440, true);
    expect(ultra.playW).toBeCloseTo(1440 * WIDE_MAX_ASPECT);
    expect(ultra.viewW).toBeCloseTo(WIDE_VIEW_H * WIDE_MAX_ASPECT);
    expect(ultra.playX).toBeGreaterThan(0);
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

describe('wantsUpright', () => {
  it('asks only a touch-only phone held sideways', () => {
    expect(wantsUpright(844, 390, true)).toBe(true);
    expect(wantsUpright(390, 844, true)).toBe(false);
    expect(wantsUpright(1920, 1080, false)).toBe(false);
  });

  it('lets a tablet play sideways', () => {
    expect(wantsUpright(1180, 820, true)).toBe(false); // iPad Air
    expect(wantsUpright(1133, 744, true)).toBe(false); // iPad mini
    expect(wantsUpright(960, 600, true)).toBe(false); // small Android tablet
  });
});

describe('wideScreen', () => {
  it('sets runs up in landscape on a sideways screen of a host that plays sideways', () => {
    expect(wideScreen(1100, 574, true)).toBe(true); // CrazyGames' canvas
    expect(wideScreen(1180, 820, true)).toBe(true); // iPad Air on its side
    expect(wideScreen(1100, 1000, true)).toBe(false);
    expect(wideScreen(1920, 1080, false)).toBe(false); // WeChat, the iOS app
  });
});
