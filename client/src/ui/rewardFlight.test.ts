import { describe, expect, it } from 'vitest';
import { emptyInventory, ITEM_IDS } from '../meta/gear';
import { BURST, bumpAt, FLIGHT, flightLength, gainOf, landsAt, MAX_COINS, MAX_GEAR, piecesOf, poseAt, shownAt, type Wallet } from './rewardFlight';

const wallet = (copper: number, jade: number, gear = emptyInventory()): Wallet => ({ copper, jade, gear });
const [first, second] = ITEM_IDS;

describe('reward flight', () => {
  it('finds what a claim paid in, and nothing for a spend or a merge', () => {
    expect(gainOf(wallet(100, 5), wallet(100, 5))).toBeNull();
    expect(gainOf(wallet(100, 5), wallet(40, 5))).toBeNull();
    expect(gainOf(wallet(100, 5), wallet(150, 7))).toEqual({ copper: 50, jade: 2, items: [] });
    const before = emptyInventory();
    before[first][0] = 3;
    const got = emptyInventory();
    got[first][0] = 3;
    got[second][1] = 2;
    expect(gainOf(wallet(0, 80, before), wallet(0, 0, got))).toEqual({ copper: 0, jade: 0, items: [second, second] });
    // a merge: three commons into one of the next tier
    const merged = emptyInventory();
    merged[first][1] = 1;
    expect(gainOf(wallet(0, 0, before), wallet(0, 0, merged))).toBeNull();
  });

  it('flies a few coins per currency and a few gear, one after another', () => {
    const pieces = piecesOf({ copper: 5000, jade: 3, items: Array(9).fill(first) });
    const kinds = (k: string) => pieces.filter((p) => p.kind === k).length;
    expect(kinds('copper')).toBeLessThanOrEqual(MAX_COINS);
    expect(kinds('copper')).toBeGreaterThan(kinds('jade'));
    expect(kinds('jade')).toBeGreaterThanOrEqual(2);
    expect(kinds('gear')).toBe(MAX_GEAR);
    pieces.slice(1).forEach((p, i) => expect(p.delay).toBeGreaterThan(pieces[i].delay));
    // no two thrown to the same spot
    expect(new Set(pieces.map((p) => `${p.out.x},${p.out.y}`)).size).toBe(pieces.length);
    expect(flightLength(pieces)).toBeLessThan(1.5);
  });

  it('bursts out of the tap and lands on the counter', () => {
    const [p] = piecesOf({ copper: 10, jade: 0, items: [] });
    const from = { x: 500, y: 1200 };
    const to = { x: 900, y: 75 };
    expect(poseAt(p, p.delay - 0.01, from, to)).toBeNull();
    const out = poseAt(p, p.delay + BURST - 1e-6, from, to)!;
    expect(out.x).toBeCloseTo(from.x + p.out.x, 0);
    expect(out.y).toBeCloseTo(from.y + p.out.y, 0);
    const near = poseAt(p, landsAt(p) - 1e-4, from, to)!;
    expect(Math.hypot(near.x - to.x, near.y - to.y)).toBeLessThan(2);
    expect(near.scale).toBeLessThan(out.scale);
    expect(poseAt(p, p.delay + BURST + FLIGHT, from, to)).toBeNull();
  });

  it('ticks a counter up as its pieces land and swells it briefly', () => {
    const gain = { copper: 100, jade: 0, items: [] };
    const pieces = piecesOf(gain);
    expect(shownAt('copper', 600, gain, pieces, 0)).toBe(500);
    const mid = shownAt('copper', 600, gain, pieces, landsAt(pieces[1]));
    expect(mid).toBeGreaterThan(500);
    expect(mid).toBeLessThan(600);
    expect(shownAt('copper', 600, gain, pieces, flightLength(pieces))).toBe(600);
    expect(shownAt('jade', 25, gain, pieces, 0)).toBe(25);
    expect(bumpAt('copper', pieces, 0)).toBe(1);
    expect(bumpAt('copper', pieces, landsAt(pieces[0]))).toBeGreaterThan(1.2);
    expect(bumpAt('copper', pieces, flightLength(pieces) + 1)).toBe(1);
  });
});
