import { describe, expect, it } from 'vitest';
import { BEADS, BOWL, FISH, FP } from '@hk/engine';
import { impactPoint, relicAlpha, relicExtra, relicSize, relicSource, ribbonQuad, type RelicBodies } from './relicBlow';

const none: RelicBodies = { rings: [], beads: [], bowls: [] };

describe('relicSource', () => {
  it('leaves the ball to the sim, and a relic with nothing out finds no source', () => {
    expect(relicSource('ball', 0, 0, none, { x: 0, y: 0, reach: 300 * FP }, [])).toBeNull();
    expect(relicSource('staff', 0, 0, none, null, [])).toBeNull();
    expect(relicSource('fish', 0, 0, none, null, [])).toBeNull();
  });

  it('puts a staff blow on the sweep that reached the target, and not one far outside it', () => {
    const sweep = { x: 1000 * FP, y: 0, reach: 300 * FP };
    expect(relicSource('staff', 1250 * FP, 0, none, sweep, [])).toBe(sweep);
    // knocked back a little past the reach still counts
    expect(relicSource('staff', 1320 * FP, 0, none, sweep, [])).toBe(sweep);
    expect(relicSource('staff', 1600 * FP, 0, none, sweep, [])).toBeNull();
  });

  it('puts a fish blow on the ring whose edge passed the target, not on a spell inside it', () => {
    const ring = { x: 0, y: 0, radius: 300 * FP, reach: 400 * FP };
    const s = { ...none, rings: [ring] };
    expect(relicSource('fish', 0, 290 * FP, s, null, [])).toBe(ring);
    expect(relicSource('fish', 0, 300 * FP - FISH.ringSpeed, s, null, [])).toBe(ring);
    expect(relicSource('fish', 0, 100 * FP, s, null, [])).toBeNull();
    expect(relicSource('fish', 0, 500 * FP, s, null, [])).toBeNull();
  });

  it('finds the ring that finished this tick in the last tick\'s rings, grown one step', () => {
    const last = { x: 0, y: 0, radius: 400 * FP - FISH.ringSpeed / 2, reach: 400 * FP };
    expect(relicSource('fish', 395 * FP, 0, none, null, [last])).toBe(last);
  });

  it('puts a bead or bowl blow on the body touching the target', () => {
    const bead = { x: 500 * FP, y: 500 * FP };
    const bowl = { x: -500 * FP, y: 0 };
    const s = { ...none, beads: [{ x: 0, y: 0 }, bead], bowls: [bowl] };
    expect(relicSource('beads', 500 * FP + BEADS.radius - FP, 500 * FP, s, null, [])).toBe(bead);
    expect(relicSource('beads', 250 * FP, 250 * FP, s, null, [])).toBeNull();
    expect(relicSource('bowl', -500 * FP, BOWL.radius, s, null, [])).toBe(bowl);
    expect(relicSource('bowl', 0, 0, s, null, [])).toBeNull();
  });
});

describe('impactPoint', () => {
  it('sits on the struck target\'s near side, in world units', () => {
    expect(impactPoint({ x: 0, y: 0 }, 300 * FP, 0, 40)).toEqual({ x: 260, y: 0 });
    // closer than twice the step back: halfway
    expect(impactPoint({ x: 0, y: 0 }, 0, 60 * FP, 40)).toEqual({ x: 0, y: 30 });
    expect(impactPoint({ x: 5 * FP, y: 5 * FP }, 5 * FP, 5 * FP, 40)).toEqual({ x: 5, y: 5 });
  });
});

describe('relic heat looks', () => {
  it('are fullest cold, calmer hot, and stay in range outside 0..1', () => {
    expect(relicSize(0)).toBeCloseTo(1.25);
    expect(relicSize(1)).toBeCloseTo(0.85);
    expect(relicAlpha(0)).toBe(1);
    expect(relicAlpha(1)).toBeCloseTo(0.65);
    expect(relicExtra(0)).toBe(1);
    expect(relicExtra(2)).toBeCloseTo(0.2);
    expect(relicSize(-1)).toBeCloseTo(1.25);
    for (const f of [relicSize, relicAlpha, relicExtra]) expect(f(0.3)).toBeGreaterThan(f(0.7));
  });
});

describe('ribbonQuad', () => {
  it('spans each end\'s width across the segment', () => {
    const out: number[] = [];
    expect(ribbonQuad(0, 0, 10, 0, 4, 2, out)).toBe(true);
    expect(out).toEqual([0, 2, 10, 1, 10, -1, 0, -2]);
    expect(ribbonQuad(3, 3, 3, 3, 4, 2, out)).toBe(false);
  });
});
