import { describe, expect, it } from 'vitest';
import { computeViewport } from '../game/viewport';
import { isWide, PLAY_W, playSpots, RAIL_R, tabCells, TOP_H } from './lobbyLayout';
import { uiFrame } from './uiLayout';

/** The chapter card's width and height (chapterCard.ts) and a monk's half width at his tallest. */
const CARD_W = 900;
const CARD_H = 420;
const MONK_HALF = 330;

describe('lobby layout', () => {
  it('keeps the portrait Play tab stacked down the middle', () => {
    for (const [w, h] of [[390, 844], [1600, 900]]) {
      const f = uiFrame(computeViewport(w, h));
      expect(isWide(f.w, f.h)).toBe(false);
      const at = playSpots(f.w, f.h, CARD_H, true);
      expect(at.card).toEqual({ x: f.w / 2, y: TOP_H + 140 });
      expect(at.figureH).toBeLessThanOrEqual(440);
      expect(at.rails[0].map((s) => s.x)).toEqual([130, 130]);
      expect(at.rails[1].map((s) => s.x)).toEqual([f.w - 130, f.w - 130]);
      expect(at.rails[0][0].y).toBe(TOP_H + 140 + CARD_H + 50 + RAIL_R);
    }
  });

  it('spreads a landscape Play tab out without overlaps', () => {
    for (const [w, h] of [[1600, 900], [1440, 900], [1100, 574]]) {
      const f = uiFrame(computeViewport(w, h, true));
      expect(isWide(f.w, f.h)).toBe(true);
      for (const switched of [false, true]) {
        const at = playSpots(f.w, f.h, CARD_H, switched);
        // the card left of the monk, inside the frame, and the switch over it
        expect(at.card.x - CARD_W / 2).toBeGreaterThan(0);
        expect(at.card.x + CARD_W / 2).toBeLessThan(at.feet.x - MONK_HALF);
        expect(at.card.y).toBeGreaterThan(TOP_H);
        expect(at.card.y + CARD_H).toBeLessThan(at.play.y);
        if (switched) expect(at.trackSwitch.y).toBeLessThan(at.card.y);
        // the monk taller than portrait's, his head under the top bar, PLAY under him
        expect(at.figureH).toBeGreaterThan(440);
        expect(at.feet.y - at.figureH).toBeGreaterThan(TOP_H);
        expect(at.play.x).toBe(f.w / 2);
        // the rails right of the monk and PLAY, inside the frame
        const xs = at.rails.flat().map((s) => s.x);
        expect(Math.min(...xs) - RAIL_R).toBeGreaterThan(Math.max(at.feet.x + MONK_HALF, at.play.x + PLAY_W / 2));
        expect(Math.max(...xs) + RAIL_R).toBeLessThan(f.w);
      }
    }
  });

  it('shares a portrait tab bar out and centres a landscape one', () => {
    expect(tabCells(1080, 1920, 5)).toEqual({ x0: 108, tw: 216 });
    const f = uiFrame(computeViewport(1600, 900, true));
    const { x0, tw } = tabCells(f.w, f.h, 5);
    expect(tw).toBeGreaterThan(216);
    expect(x0 + 2 * tw).toBeCloseTo(f.w / 2);
    expect(x0 - tw / 2).toBeGreaterThan(0);
  });
});
