import { describe, expect, it } from 'vitest';
import { CARD_LOCK, CARD_RISE_Y, cardPose, cardsSettled, rimPoints } from './cardGate';

describe('cardPose', () => {
  it('rises the cards in one after another, locked', () => {
    const first = cardPose(0, 0);
    expect(first).toMatchObject({ y: CARD_RISE_Y, alpha: 0, locked: true, rim: 0, scale: 1 });
    // the lower card is still further down than the upper one
    expect(cardPose(0.1, 2).y).toBeGreaterThan(cardPose(0.1, 0).y);
    expect(cardPose(0.45, 2)).toMatchObject({ y: 0, alpha: 1, locked: true });
  });

  it('stays deaf to taps for the whole lock while the rim closes', () => {
    expect(cardPose(CARD_LOCK - 0.01, 0).locked).toBe(true);
    expect(cardPose(CARD_LOCK / 2, 1).rim).toBeCloseTo(0.5);
    expect(cardPose(CARD_LOCK, 1)).toMatchObject({ locked: false, rim: 1, rimAlpha: 1 });
  });

  it('pops and lets the rim fade once unlocked, then settles', () => {
    expect(cardPose(CARD_LOCK + 0.08, 0).scale).toBeGreaterThan(1);
    expect(cardsSettled(CARD_LOCK + 0.08)).toBe(false);
    expect(cardsSettled(CARD_LOCK + 0.2)).toBe(true);
    expect(cardPose(CARD_LOCK + 0.2, 0)).toMatchObject({ scale: 1, rimAlpha: 0 });
  });
});

describe('rimPoints', () => {
  const length = (p: number[]) => {
    let sum = 0;
    for (let i = 2; i < p.length; i += 2) sum += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    return sum;
  };

  it('starts at the middle of the top edge and runs clockwise', () => {
    const p = rimPoints(400, 200, 20, 0.1);
    expect(p.slice(0, 2)).toEqual([0, -100]);
    expect(p[p.length - 2]).toBeGreaterThan(0);
    expect(p[p.length - 1]).toBeCloseTo(-100);
  });

  it('closes the whole outline at 1, and grows with the share', () => {
    const full = rimPoints(400, 200, 20, 1);
    expect(full[full.length - 2]).toBeCloseTo(0);
    expect(full[full.length - 1]).toBeCloseTo(-100);
    // a rounded box is a little shorter than its square corners
    expect(length(full)).toBeLessThan(1200);
    expect(length(full)).toBeGreaterThan(1150);
    expect(length(rimPoints(400, 200, 20, 0.5))).toBeCloseTo(length(full) / 2, 0);
    expect(rimPoints(400, 200, 20, 0)).toEqual([0, -100]);
  });
});
