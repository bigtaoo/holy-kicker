import { HURT, THREATS } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2, FP } from '../math/fixed';
import { atan2B, BRAD_FULL, cosB, sinB, TRIG_ONE } from '../math/trig';
import type { SimState } from '../state';
import { nearestPlayer } from './horde';

// Enemy attacks: bullets (fired by shooters and the toad king, systems/marsh.ts, or for the
// readability test from random mobs near a player, or in a ring by the empowered boss's slam) and ground zones that warn first and then
// blast (the toad king's poison pools, or the test's random ones).

/** Flies every bullet; one that meets a player hurts him and is gone. */
export function bulletSystem(s: SimState, hurt: (owner: number, value: number) => void): void {
  const p = THREATS;
  const hit2 = p.hitRadius * p.hitRadius;
  let w = 0;
  for (const b of s.bullets) {
    b.age++;
    b.px = b.x;
    b.py = b.y;
    b.x += b.vx;
    b.y += b.vy;
    let hit = false;
    for (const pl of s.players) {
      if (dist2(b.x - pl.x, b.y - pl.y) < hit2) {
        hurt(pl.owner, HURT.bullet);
        hit = true;
      }
    }
    if (!hit && b.age < p.bulletLife) s.bullets[w++] = b;
  }
  s.bullets.length = w;
}

/** The readability test's attacks: fans from random mobs and random zones. */
export function threatSystem(s: SimState): void {
  const p = THREATS;
  if (--s.volleyT <= 0) {
    s.volleyT += p.volleyEvery;
    fire(s);
  }
  if (--s.zoneT <= 0) {
    s.zoneT += p.zoneEvery;
    place(s);
  }
}

/** Ages every zone; one at THREATS.warn goes off, hurting the players in it. */
export function zoneSystem(s: SimState, events: SimEvent[], hurt: (owner: number, value: number) => void): void {
  const p = THREATS;
  let w = 0;
  for (const z of s.zones) {
    z.age++;
    if (z.age < p.warn) {
      s.zones[w++] = z;
      continue;
    }
    events.push({ type: 'blast', x: z.x, y: z.y, radius: z.radius });
    for (const pl of s.players) if (dist2(z.x - pl.x, z.y - pl.y) < z.radius * z.radius) hurt(pl.owner, z.hurt);
  }
  s.zones.length = w;
}

/** A fan of `n` bullets from (x, y) aimed at (tx, ty). */
export function fan(s: SimState, x: number, y: number, tx: number, ty: number, n = THREATS.fan): void {
  const p = THREATS;
  const aim = atan2B(ty - y, tx - x);
  for (let i = 0; i < n; i++) {
    const a = aim + Math.trunc(((2 * i - (n - 1)) * p.fanStep) / 2);
    const vx = Math.trunc((cosB(a) * p.bulletSpeed) / TRIG_ONE);
    const vy = Math.trunc((sinB(a) * p.bulletSpeed) / TRIG_ONE);
    s.bullets.push({ x, y, px: x, py: y, vx, vy, age: 0 });
  }
}

/**
 * A ring of `n` bullets flying out from a circle of radius `r` around (x, y), turned by `turn`
 * (brads) so rings differ.
 */
export function ring(s: SimState, x: number, y: number, r: number, n: number, turn: number): void {
  const v = THREATS.bulletSpeed;
  for (let i = 0; i < n; i++) {
    const a = turn + Math.trunc((i * BRAD_FULL) / n);
    const bx = x + Math.trunc((cosB(a) * r) / TRIG_ONE);
    const by = y + Math.trunc((sinB(a) * r) / TRIG_ONE);
    s.bullets.push({ x: bx, y: by, px: bx, py: by, vx: Math.trunc((cosB(a) * v) / TRIG_ONE), vy: Math.trunc((sinB(a) * v) / TRIG_ONE), age: 0 });
  }
}

/** A fan from a random mob in range of its nearest player, aimed at that player. */
function fire(s: SimState): void {
  const p = THREATS;
  if (s.mobs.length === 0) return;
  for (let k = 0; k < p.picks; k++) {
    const m = s.mobs[s.ai.int(s.mobs.length)];
    const t = nearestPlayer(s.players, m.x, m.y);
    const d = dist(t.x - m.x, t.y - m.y);
    if (d > p.range || d < FP) continue;
    fan(s, m.x, m.y, t.x, t.y);
    return;
  }
}

/** A zone near a random player, often right on their path. */
function place(s: SimState): void {
  const p = THREATS;
  const t = s.players[s.ai.int(s.players.length)];
  const a = s.ai.int(65536);
  const r = s.ai.int(p.zoneSpread + 1);
  s.zones.push({
    x: t.x + Math.trunc((cosB(a) * r) / TRIG_ONE), y: t.y + Math.trunc((sinB(a) * r) / TRIG_ONE), radius: p.zoneRadius, age: 0, hurt: HURT.zone,
  });
}
