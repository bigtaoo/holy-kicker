import { describe, expect, it } from 'vitest';
import { computeViewport } from '../game/viewport';
import { uiFrame } from './uiLayout';

describe('uiFrame', () => {
  it('fills a 9:16 phone exactly with the design size', () => {
    const f = uiFrame(computeViewport(1080, 1920));
    expect(f.w).toBeCloseTo(1080);
    expect(f.h).toBeCloseTo(1920);
  });

  it('gives taller phones extra height and desktop extra width', () => {
    const tall = uiFrame(computeViewport(390, 844));
    expect(tall.w).toBeCloseTo(1080);
    expect(tall.h).toBeGreaterThan(1920);
    const desk = uiFrame(computeViewport(1600, 900));
    expect(desk.h).toBeCloseTo(1920);
    expect(desk.w).toBeGreaterThan(1080);
    expect(desk.w / desk.h).toBeCloseTo(3 / 4);
  });

  it('keeps the UI out of the safe-area bands, which a letterbox bar already covers', () => {
    const f = uiFrame(computeViewport(390, 844), { top: 90, bottom: 34 });
    expect(f.y).toBeCloseTo(90);
    expect(f.h * f.scale).toBeCloseTo(844 - 90 - 34);
    expect(f.w).toBeCloseTo(1080);
    // a screen taller than 9:22 is letterboxed; a bar taller than the inset absorbs it
    const boxed = computeViewport(300, 900);
    expect(boxed.playY).toBeGreaterThan(40);
    expect(uiFrame(boxed, { top: 40, bottom: 0 }).y).toBeCloseTo(boxed.playY);
  });

  it("spreads a landscape UI over a squarer screen's bars, down to 4:3, so its text keeps the 3:4 frame's size", () => {
    // 16:9 fills the play area; a 4:3 tablet on its side plays in a 16:10 strip but its UI takes the whole screen
    const wide = uiFrame(computeViewport(1920, 1080, true));
    expect(wide.h).toBeCloseTo(1920);
    const tablet = computeViewport(1024, 768, true);
    expect(tablet.playY).toBeGreaterThan(0);
    const f = uiFrame(tablet);
    expect(f.scale).toBeCloseTo(uiFrame(computeViewport(1024, 768)).scale);
    expect([f.y, f.w, f.h]).toEqual([0, 2560, 1920].map((n) => expect.closeTo(n)));
    // squarer than 4:3 the UI keeps that shape, centred, and the bar left over covers an inset
    const square = uiFrame(computeViewport(1100, 1000, true), { top: 30, bottom: 0 });
    expect(square.w / square.h).toBeCloseTo(4 / 3);
    expect(square.y).toBeCloseTo((1000 - 1100 * 3 / 4) / 2);
  });
});
