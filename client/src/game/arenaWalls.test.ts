import { describe, expect, it } from 'vitest';
import { ARENA, ARENA_GATES, FP } from '@hk/engine';
import { GATE_OPEN, HALF, POST, WALL, gatePosts, wallPieces } from './arenaWalls';

const overlaps = (a: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  a.x > r.x && a.x < r.x + r.w && a.y > r.y && a.y < r.y + r.h;

describe('arena walls', () => {
  it('lies outside the engine square, all round it', () => {
    const pieces = wallPieces();
    // two gates per side split each side into three pieces
    expect(pieces).toHaveLength(12);
    for (const r of pieces) {
      const inside = r.x + r.w <= -HALF || r.x >= HALF || r.y + r.h <= -HALF || r.y >= HALF;
      expect(inside).toBe(true);
    }
    // the band's total length: four sides corner to corner, minus the openings
    const length = pieces.reduce((n, r) => n + Math.max(r.w, r.h), 0);
    expect(length).toBe(4 * 2 * (HALF + WALL) - ARENA_GATES.length * GATE_OPEN);
  });

  it('leaves every gate open, wider than where the horde comes in', () => {
    expect(GATE_OPEN).toBeGreaterThan(2 * (ARENA.gateHalf / FP));
    for (const g of ARENA_GATES) {
      const side = Math.abs(g.x) === ARENA.half;
      // a point in the band at the gate's middle
      const p = side ? { x: (g.x / FP) + Math.sign(g.x) * WALL / 2, y: g.y / FP } : { x: g.x / FP, y: (g.y / FP) + Math.sign(g.y) * WALL / 2 };
      for (const r of wallPieces()) expect(overlaps(p, r)).toBe(false);
    }
  });

  it('puts a post either side of every gate, on the band', () => {
    const posts = gatePosts();
    expect(posts).toHaveLength(2 * ARENA_GATES.length);
    for (const p of posts) {
      expect(p.w).toBe(POST);
      const cx = p.x + POST / 2;
      const cy = p.y + POST / 2;
      expect(Math.max(Math.abs(cx), Math.abs(cy))).toBe(HALF + WALL / 2);
    }
  });
});
