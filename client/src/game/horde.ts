import { SpatialGrid, type Point } from './grid';

// Placeholder horde movement: every mob walks toward the target, then soft collision moves
// it out of any neighbour closer than sepRadius. Resolving overlap in position (rather than
// as a push velocity) holds up however hard the crowd presses in. Neighbours come from a
// spatial hash with cells of sepRadius, so the step is O(n) instead of O(n^2).

export type Mob = Point;

export interface HordeParams {
  speed: number;
  /** Mobs stop pressing in once this close to the target. */
  stopDist: number;
  /** Neighbours closer than this push each other apart. */
  sepRadius: number;
  /**
   * A mob with a neighbour right ahead of it waits instead of pressing on, so a jammed crowd
   * stands still rather than churning (the churn reads as a swimming, dizzying pile).
   */
  queue?: boolean;
}

/** A neighbour counts as ahead within this angle of the way to the target (cos 50 deg). */
const AHEAD_COS = 0.64;

/** Most neighbours one mob looks at; a pile denser than this ignores the rest. */
const MAX_NEAR = 64;
const near = new Int32Array(MAX_NEAR);
/** Share of an overlap a mob removes on its side; the neighbour removes its own share. */
const STIFFNESS = 0.4;

export function stepHorde(
  mobs: Mob[], tx: number, ty: number, dt: number, p: HordeParams,
  grid?: SpatialGrid,
): void {
  const separate = p.sepRadius > 0 && mobs.length > 1;
  if (separate) (grid ??= new SpatialGrid(p.sepRadius)).build(mobs);
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    const dx = tx - m.x;
    const dy = ty - m.y;
    const d = Math.hypot(dx, dy);
    if (d > p.stopDist && !(p.queue && separate && blocked(mobs, i, dx / d, dy / d, p.sepRadius, grid!))) {
      m.x += (dx / d) * p.speed * dt;
      m.y += (dy / d) * p.speed * dt;
    }
    const n = separate ? grid!.near(m.x, m.y, near) : 0;
    for (let k = 0; k < n; k++) {
      const j = near[k];
      if (j === i) continue;
      const ox = m.x - mobs[j].x;
      const oy = m.y - mobs[j].y;
      const od = Math.hypot(ox, oy);
      if (od < p.sepRadius) {
        // exactly stacked mobs split along an arbitrary but fixed axis
        const push = (p.sepRadius - od) * STIFFNESS;
        m.x += od > 0 ? (ox / od) * push : (i < j ? -push : push);
        m.y += od > 0 ? (oy / od) * push : 0;
      }
    }
  }
}

/** True if a neighbour within the separation radius lies ahead of mob i along (ux, uy). */
function blocked(mobs: Mob[], i: number, ux: number, uy: number, r: number, grid: SpatialGrid): boolean {
  const m = mobs[i];
  const n = grid.near(m.x, m.y, near);
  for (let k = 0; k < n; k++) {
    const j = near[k];
    if (j === i) continue;
    const ox = mobs[j].x - m.x;
    const oy = mobs[j].y - m.y;
    const od = Math.hypot(ox, oy);
    if (od > 0 && od < r && (ox * ux + oy * uy) / od > AHEAD_COS) return true;
  }
  return false;
}
