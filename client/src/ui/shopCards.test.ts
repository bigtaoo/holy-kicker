import { describe, expect, it } from 'vitest';
import { CARD_W, shopSpots } from './shopCards';

describe('shop card spots', () => {
  it('stacks portrait cards down the middle with the refill line under them', () => {
    const at = shopSpots(3, 1500, 1080, false);
    expect(at.row).toBe(false);
    expect(at.w).toBe(CARD_W);
    expect(at.at.every((p) => p.x === 0)).toBe(true);
    for (let i = 1; i < 3; i++) expect(at.at[i].y - at.at[i - 1].y).toBeGreaterThanOrEqual(at.h);
    expect(at.foot).toBeGreaterThan(at.at[2].y + at.h / 2);
  });

  it('stands landscape cards in one centred row inside the frame and the room', () => {
    for (const n of [3, 4]) {
      const room = 1070;
      const at = shopSpots(n, room, 2560, true);
      expect(at.row).toBe(true);
      expect(at.at[0].x).toBeCloseTo(-at.at[n - 1].x);
      expect(at.at[n - 1].x + at.w / 2).toBeLessThan(2560 / 2);
      for (let i = 1; i < n; i++) expect(at.at[i].x - at.at[i - 1].x).toBeGreaterThan(at.w);
      expect(at.at[0].y - at.h / 2).toBeGreaterThanOrEqual(0);
      expect(at.foot!).toBeLessThan(room);
    }
  });

  it('falls back to the column where the row does not fit', () => {
    expect(shopSpots(5, 1500, 2560, true).row).toBe(false);
  });
});
