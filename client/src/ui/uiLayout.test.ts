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
});
