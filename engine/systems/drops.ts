import { DROPS } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2, isqrt } from '../math/fixed';
import type { Gem, Player, SimState } from '../state';
import { gainXp, magnetOf } from './build';

// Experience gems. A horde survivor drops a gem per kill, so two rules keep a long run bounded
// without losing experience:
// - one gem per merge cell: a drop on a cell holding a resting gem adds its value to it (the
//   gem looks bigger as its value grows);
// - a cap on resting gems: past it, the oldest resting gem moves to the new drop and adds its
//   value to it. The oldest gems lie where the hero has long left, so the experience follows
//   the fight and fresh kills keep dropping gems in sight.
// Gems within the magnet radius of a player fly to them and are collected on contact. Resting
// gems are found by looking up the cells around each player, never by scanning them all.

export function tierOf(value: number): number {
  let t = 0;
  while (t < DROPS.tiers.length && value >= DROPS.tiers[t]) t++;
  return t;
}

function cellOf(cx: number, cy: number): number {
  // world coordinates stay well inside +-2^15 cells
  return (cx + 32768) * 65536 + cy + 32768;
}

function spawn(s: SimState, x: number, y: number, value: number, cell: number): Gem {
  const g: Gem = { x, y, px: x, py: y, vx: 0, vy: 0, value, tier: tierOf(value), age: 0, flying: false, cell };
  s.gems.push(g);
  return g;
}

export function dropGem(s: SimState, x: number, y: number, value: number): void {
  const cell = cellOf(Math.floor(x / DROPS.cell), Math.floor(y / DROPS.cell));
  const here = s.gemCells.get(cell);
  if (here) {
    here.value += value;
    here.tier = tierOf(here.value);
    return;
  }
  if (s.resting >= DROPS.max) {
    // gems keep their drop order, so the first resting one is the oldest
    const i = s.gems.findIndex((g) => !g.flying);
    const old = s.gems[i];
    s.gems.splice(i, 1);
    s.gemCells.delete(old.cell);
    s.resting--;
    value += old.value;
  }
  s.gemCells.set(cell, spawn(s, x, y, value, cell));
  s.resting++;
}

function launch(s: SimState, g: Gem, p: Player): void {
  s.gemCells.delete(g.cell);
  s.resting--;
  g.flying = true;
  g.age = 0;
  const d = dist(g.x - p.x, g.y - p.y) || 1;
  g.vx = Math.trunc(((g.x - p.x) * DROPS.hop) / d);
  g.vy = Math.trunc(((g.y - p.y) * DROPS.hop) / d);
}

/** Resting gems within r of (x, y) fly to the player (Lotus Path). */
export function pullGems(s: SimState, p: Player, x: number, y: number, r: number): void {
  const r2 = r * r;
  for (const g of s.gems) if (!g.flying && dist2(g.x - x, g.y - y) <= r2) launch(s, g, p);
}

/** Every gem on the map flies to the player (a vacuum pickup). */
export function attractAll(s: SimState, p: Player): void {
  for (const g of s.gems) if (!g.flying) launch(s, g, p);
}

/** Resting gems in the cells overlapping the player's magnet circle start flying. */
function attractNear(s: SimState, p: Player): void {
  const { cell } = DROPS;
  const magnet = magnetOf(p);
  const m2 = magnet * magnet;
  const x0 = Math.floor((p.x - magnet) / cell);
  const x1 = Math.floor((p.x + magnet) / cell);
  const y0 = Math.floor((p.y - magnet) / cell);
  const y1 = Math.floor((p.y + magnet) / cell);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const g = s.gemCells.get(cellOf(cx, cy));
      if (g && dist2(g.x - p.x, g.y - p.y) < m2) launch(s, g, p);
    }
  }
}

/** Flying gems steer to their nearest player, speeding up; collected on contact. */
export function dropSystem(s: SimState, events: SimEvent[]): void {
  for (const p of s.players) attractNear(s, p);
  const pick2 = DROPS.pickup * DROPS.pickup;
  const best = new Map<number, number>();
  const gems = s.gems;
  let w = 0;
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    g.age++;
    g.px = g.x;
    g.py = g.y;
    if (g.flying) {
      let p = s.players[0];
      let d2 = dist2(p.x - g.x, p.y - g.y);
      for (let k = 1; k < s.players.length; k++) {
        const e = dist2(s.players[k].x - g.x, s.players[k].y - g.y);
        if (e < d2) {
          d2 = e;
          p = s.players[k];
        }
      }
      if (d2 < pick2) {
        gainXp(p, g.value);
        best.set(p.owner, Math.max(best.get(p.owner) ?? 0, g.tier));
        continue;
      }
      // steer the velocity toward the player while the speed builds up
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = isqrt(d2) || 1;
      const speed = Math.min(DROPS.maxSpeed, dist(g.vx, g.vy) + DROPS.accel);
      g.vx += Math.trunc(((Math.trunc((dx * speed) / d) - g.vx) * DROPS.turn) / 1000);
      g.vy += Math.trunc(((Math.trunc((dy * speed) / d) - g.vy) * DROPS.turn) / 1000);
      g.x += g.vx;
      g.y += g.vy;
    }
    // collected gems are dropped by compacting in place, which keeps the order
    gems[w++] = g;
  }
  gems.length = w;
  for (const p of s.players) {
    const tier = best.get(p.owner);
    if (tier !== undefined) events.push({ type: 'pickup', owner: p.owner, tier });
  }
}
