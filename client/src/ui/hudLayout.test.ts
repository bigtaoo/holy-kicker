import { describe, expect, it } from 'vitest';
import { computeViewport } from '../game/viewport';
import { cardSpots, cardWidth, cardsInRow, hudRows } from './hudLayout';
import { uiFrame } from './uiLayout';

describe('hud layout', () => {
  it('keeps the portrait rows on a phone and a desktop column', () => {
    for (const [w, h] of [[390, 844], [1600, 900]]) {
      const rows = hudRows(uiFrame(computeViewport(w, h)));
      expect(rows).toEqual({ wide: false, waveY: 300, buttonsY: 300, bossTop: 550 });
    }
  });

  it('raises the rows into the corners of a landscape run', () => {
    for (const [w, h] of [[1600, 900], [1440, 900], [1100, 574]]) {
      const rows = hudRows(uiFrame(computeViewport(w, h, true)));
      expect(rows.wide).toBe(true);
      expect(rows.waveY).toBeLessThan(300);
      expect(rows.bossTop).toBeLessThan(550);
    }
  });

  it('stacks the cards down the middle of a portrait frame', () => {
    const f = { w: 1080, h: 1920 };
    expect(cardSpots(f, 3, 960, 330, 44, 600)).toEqual([
      { x: 540, y: 765 }, { x: 540, y: 1139 }, { x: 540, y: 1513 },
    ]);
  });

  it('narrows the cards to fit their row on a landscape frame too short for their column', () => {
    const f = uiFrame(computeViewport(1440, 900, true));
    const w = cardWidth(f, 3, 960, 44, 1738);
    expect(w).toBeLessThan(960);
    expect(cardsInRow(f, 3, w, 44)).toBe(true);
    const spots = cardSpots(f, 3, w, 330, 44, 700);
    expect(spots.map((s) => s.y)).toEqual([865, 865, 865]);
    expect(spots[1].x).toBeCloseTo(f.w / 2);
    expect(spots[0].x - w / 2).toBeGreaterThan(0);
    expect(spots[2].x + w / 2).toBeLessThan(f.w);
  });

  it('stacks the cards in the column on a landscape frame too narrow for the row (a 4:3 tablet)', () => {
    const f = uiFrame(computeViewport(1024, 768, true));
    expect(cardsInRow(f, 3, 960, 44)).toBe(false);
    expect(cardsInRow(f, 2, 960, 44)).toBe(true);
    expect(cardSpots(f, 3, 960, 330, 44, 600).map((s) => s.x)).toEqual([1280, 1280, 1280]);
    // the column fits its 1920 units of height, so it keeps its size
    expect(cardWidth(f, 3, 960, 44, 1738)).toBe(960);
    expect(cardWidth(uiFrame(computeViewport(1080, 1920)), 3, 960, 44, 1738)).toBe(960);
  });
});
