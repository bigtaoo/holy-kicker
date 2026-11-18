import { toFp } from './math/fixed';
import { VIEW, VIEW_WIDE, type RunConfig } from './config';
import type { Body, SimState } from './state';
import { teleport } from './state';

// The arena (docs/design.md "Arena"): an endless run inside walls, the ground for co-op later.
// Heroes start in the middle of a square ARENA.half either way from it; nobody walks out (every
// step ends with arenaSystem pulling heroes, mobs, elites and the boss back inside), and the
// horde comes in only through ARENA.gates in the walls, never on a ring around the hero, so
// no mob ever appears from nowhere and two heroes far apart share one field.

export const ARENA = {
  /** Half the arena's side: 3200 units across, about two phone screens either way. */
  half: toFp(1600),
  /** How near a body's centre comes to a wall. */
  inset: toFp(60),
  /** The gates: two on each wall, this far either side of its middle. */
  gateOffset: toFp(800),
  /** A mob comes in anywhere along its gate's width (this either side of the gate's middle)... */
  gateHalf: toFp(110),
  /** ...and this far in from the wall at most. */
  gateDepth: toFp(160),
  /** Waves in an arena run: more than anyone plays (15 s each), so it ends only when every hero is down. */
  waves: 999,
  /** The chapter whose horde, elites and mid-bosses the arena brings (and map it is drawn on). */
  chapter: 1,
};

/** Whether a run is played in the arena (RunConfig.arena). */
export const arenaRun = (c: RunConfig): boolean => c.arena === true;

/** The gates' middles on the walls, clockwise from the top wall's left one. */
export const ARENA_GATES: readonly { x: number; y: number }[] = (() => {
  const h = ARENA.half;
  const o = ARENA.gateOffset;
  return [
    { x: -o, y: -h }, { x: o, y: -h },
    { x: h, y: -o }, { x: h, y: o },
    { x: o, y: h }, { x: -o, y: h },
    { x: -h, y: o }, { x: -h, y: -o },
  ];
})();

/** Clamps `v` to the arena's inside on one axis. */
function inside(v: number): number {
  const lim = ARENA.half - ARENA.inset;
  return v < -lim ? -lim : v > lim ? lim : v;
}

/** Pulls `b` back inside the walls (a body already inside is left alone). */
export function keepIn(b: Body): void {
  b.x = inside(b.x);
  b.y = inside(b.y);
}

/** Whether a gate lies on a living hero's screen. */
function gateSeen(s: SimState, gx: number, gy: number): boolean {
  const v = s.config.wide === true ? VIEW_WIDE : VIEW;
  return s.players.some((p) => !p.dead && Math.abs(gx - p.x) <= v.halfW && Math.abs(gy - p.y) <= v.halfH);
}

/**
 * Puts `b` in a gate no living hero sees (any gate when they see them all), anywhere along its
 * width and a little way in, so the horde walks in from the walls.
 */
export function gatePoint(s: SimState, b: Body): void {
  let hidden = 0;
  for (const g of ARENA_GATES) if (!gateSeen(s, g.x, g.y)) hidden++;
  let pick = s.ai.int(hidden > 0 ? hidden : ARENA_GATES.length);
  let gate = ARENA_GATES[0];
  for (const g of ARENA_GATES) {
    if (hidden > 0 && gateSeen(s, g.x, g.y)) continue;
    if (pick-- === 0) {
      gate = g;
      break;
    }
  }
  const along = s.ai.range(-ARENA.gateHalf, ARENA.gateHalf);
  const depth = ARENA.inset + s.ai.range(0, ARENA.gateDepth);
  // the gate's wall: a top or bottom one runs along x, a side one along y
  const sideWall = Math.abs(gate.x) === ARENA.half;
  const x = sideWall ? gate.x - Math.sign(gate.x) * depth : gate.x + along;
  const y = sideWall ? gate.y + along : gate.y - Math.sign(gate.y) * depth;
  teleport(b, x, y);
}

/** The arena's last step: everything that moved is back inside the walls. */
export function arenaSystem(s: SimState): void {
  if (!arenaRun(s.config)) return;
  for (const p of s.players) keepIn(p);
  for (const m of s.mobs) keepIn(m);
  for (const e of s.elites) keepIn(e);
  if (s.boss) keepIn(s.boss);
}
