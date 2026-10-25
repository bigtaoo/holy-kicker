import { describe, expect, it } from 'vitest';
import { corgiBubble, corgiCrater, corgiDisc, corgiDrone, corgiMine, corgiPuddle, corgiSaw } from './corgiFx';

describe('corgi gadget shapes', () => {
  it('draw within their radius, the repair field the same size as the plasma one', () => {
    const field = corgiPuddle(100, false).getLocalBounds();
    const repair = corgiPuddle(100, true).getLocalBounds();
    expect(field.width).toBeGreaterThan(180);
    expect(field.width).toBeLessThanOrEqual(210);
    expect(repair.width).toBeCloseTo(field.width, 0);
  });

  it('draws every other gadget with some area', () => {
    for (const g of [corgiCrater(60), corgiSaw(40), corgiBubble(50), corgiDrone(30, false), corgiDrone(30, true),
      corgiDisc(40, false), corgiDisc(40, true), corgiMine(30, false), corgiMine(30, true)]) {
      const b = g.getLocalBounds();
      expect(b.width * b.height).toBeGreaterThan(0);
    }
  });
});
