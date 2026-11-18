import { ARENA, ARENA_GATES, FP } from '@hk/engine';

// The arena's walls as rectangles in world units (arenaView.ts draws them): a band just outside
// the engine's square on every side, broken where the gates are, and a post either side of each gate.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The wall band's thickness, outside the arena's edge. */
export const WALL = 56;
/** A gate's opening: wider than where the horde comes in (ARENA.gateHalf either side). */
export const GATE_OPEN = 2 * (ARENA.gateHalf / FP) + 120;
/** A gate post's side. */
export const POST = 84;

/** The arena's half side in world units. */
export const HALF = ARENA.half / FP;

/** The wall's pieces: each side's band from corner to corner, minus its gates' openings. */
export function wallPieces(): Rect[] {
  const out: Rect[] = [];
  const outer = HALF + WALL;
  // the top and bottom walls run along x, the sides along y; each runs over the corners' squares
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const horizontal = side === 'top' || side === 'bottom';
    // where the gates on this side open, along the wall
    const gates = ARENA_GATES.filter((g) => (horizontal ? g.y === (side === 'top' ? -ARENA.half : ARENA.half) : g.x === (side === 'left' ? -ARENA.half : ARENA.half)))
      .map((g) => (horizontal ? g.x : g.y) / FP)
      .sort((a, b) => a - b);
    let from = -outer;
    for (const at of [...gates, null]) {
      const to = at === null ? outer : at - GATE_OPEN / 2;
      if (to > from) {
        const across = side === 'top' || side === 'left' ? -outer : HALF;
        out.push(horizontal ? { x: from, y: across, w: to - from, h: WALL } : { x: across, y: from, w: WALL, h: to - from });
      }
      if (at !== null) from = at + GATE_OPEN / 2;
    }
  }
  return out;
}

/** The posts either side of every gate, centred on the wall band. */
export function gatePosts(): Rect[] {
  const out: Rect[] = [];
  for (const g of ARENA_GATES) {
    const gx = g.x / FP;
    const gy = g.y / FP;
    const sideWall = Math.abs(gx) === HALF;
    // the band's middle, outside the edge
    const mid = (sideWall ? Math.sign(gx) : Math.sign(gy)) * (HALF + WALL / 2);
    for (const end of [-1, 1]) {
      const along = (sideWall ? gy : gx) + (end * (GATE_OPEN + POST)) / 2;
      const cx = sideWall ? mid : along;
      const cy = sideWall ? along : mid;
      out.push({ x: cx - POST / 2, y: cy - POST / 2, w: POST, h: POST });
    }
  }
  return out;
}
