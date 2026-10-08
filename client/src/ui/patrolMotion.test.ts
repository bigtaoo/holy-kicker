import { describe, expect, it } from 'vitest';
import { COIN_EVERY, arc, coinStep, dropFlies, noTwins, patrolPose, propX, roadProps, sackScale, settle, stepPace, wrap } from './patrolMotion';

describe('patrol motion', () => {
  it('walks until the patrol is full, then rests', () => {
    expect(patrolPose(0, 12)).toBe('walk');
    expect(patrolPose(11.99, 12)).toBe('walk');
    expect(patrolPose(12, 12)).toBe('rest');
  });

  it('eases the pace without overshooting', () => {
    expect(stepPace(0, 'walk', 0.3)).toBeCloseTo(0.5);
    expect(stepPace(0.9, 'walk', 1)).toBe(1);
    expect(stepPace(0.2, 'rest', 1)).toBe(0);
  });

  it('wraps negative positions too', () => {
    expect(wrap(-10, 100)).toBe(90);
    expect(wrap(250, 100)).toBe(50);
  });

  it('lays the same road every time, in order, with no two of a kind side by side', () => {
    const kinds = ['pine', 'lantern', 'rocks', 'bamboo'];
    const a = roadProps(kinds, 4000, 300);
    expect(a).toEqual(roadProps(kinds, 4000, 300));
    expect(a.length).toBe(13);
    for (let i = 1; i < a.length; i++) {
      expect(a[i].x).toBeGreaterThan(a[i - 1].x);
      expect(a[i].kind).not.toBe(a[i - 1].kind);
    }
    expect(a[a.length - 1].x).toBeLessThan(4000);
    expect(roadProps([], 4000, 300)).toEqual([]);
  });

  it('never puts two of a kind side by side where the loop closes, whatever the seed', () => {
    const kinds = ['pine', 'lantern', 'rocks', 'bamboo', 'sign', 'bush'];
    for (let seed = 0; seed < 200; seed++) {
      for (const [length, gap] of [[3600, 330], [4000, 300], [1000, 300]]) {
        const road = roadProps(kinds, length, gap, seed);
        expect(noTwins(road), `seed ${seed}, ${length}/${gap}: ${road.map((p) => p.kind)}`).toBe(true);
        // every kind still shows up as often as the rounds allow
        const counts = kinds.map((k) => road.filter((p) => p.kind === k).length);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps every prop in its size range and mirrors some of them', () => {
    const road = roadProps(['pine', 'lantern', 'rocks'], 36000, 300);
    for (const p of road) {
      expect(p.scale).toBeGreaterThanOrEqual(0.7);
      expect(p.scale).toBeLessThan(1);
    }
    const flipped = road.filter((p) => p.flip).length;
    expect(flipped).toBeGreaterThan(road.length * 0.3);
    expect(flipped).toBeLessThan(road.length * 0.7);
  });

  it('walks props off the left edge and brings them back at the far end of the loop', () => {
    expect(propX(500, 0, 3600, 150)).toBe(500);
    expect(propX(500, 300, 3600, 150)).toBe(200);
    // still on the road just past the left edge, then gone round to the far end
    expect(propX(500, 649, 3600, 150)).toBe(-149);
    expect(propX(500, 651, 3600, 150)).toBe(3449);
    // one whole loop later it is back where it started
    expect(propX(500, 3600 * 3 + 300, 3600, 150)).toBeCloseTo(200);
  });

  it('finds a coin every few seconds at a full walk, never while stopping', () => {
    let clock = 0;
    let coins = 0;
    for (let i = 0; i < 600; i++) {
      const step = coinStep(clock, 1 / 60, 1);
      clock = step.clock;
      if (step.coin) coins++;
    }
    expect(coins).toBe(Math.floor(10 / COIN_EVERY));
    expect(coinStep(COIN_EVERY - 0.01, 1, 0.5)).toEqual({ clock: COIN_EVERY - 0.01, coin: false });
  });

  it('pours no coins after a long frame', () => {
    const step = coinStep(0, COIN_EVERY * 5.5, 1);
    expect(step.coin).toBe(true);
    expect(step.clock).toBeCloseTo(COIN_EVERY * 0.5);
  });

  it('flies a gear drop in only when one is found while the panel is up', () => {
    expect(dropFlies(-1, 1)).toBe(false);
    expect(dropFlies(1, 1)).toBe(false);
    expect(dropFlies(1, 2)).toBe(true);
    // collecting empties the patrol: no drop flies
    expect(dropFlies(2, 0)).toBe(false);
  });

  it('settles the sack back from a bounce without overshooting', () => {
    expect(settle(1.2, 1, 1 / 16)).toBeCloseTo(1.1);
    expect(settle(1.2, 1, 1)).toBe(1);
    let size = 1.12;
    for (let i = 0; i < 60; i++) size = settle(size, 1, 1 / 60);
    expect(size).toBeCloseTo(1, 3);
  });

  it('fills the sack with the hours, up to the cap', () => {
    expect(sackScale(0, 12)).toBeCloseTo(0.7);
    expect(sackScale(24, 12)).toBeCloseTo(1.15);
  });

  it('flies along an arc that starts and ends on its points', () => {
    const a = { x: 0, y: 100 };
    const b = { x: 200, y: 0 };
    expect(arc(a, b, 0, 50)).toEqual(a);
    expect(arc(a, b, 1, 50)).toEqual(b);
    expect(arc(a, b, 0.5, 50)).toEqual({ x: 100, y: 0 });
  });
});
