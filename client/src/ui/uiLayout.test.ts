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
});
