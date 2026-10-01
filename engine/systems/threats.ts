import { THREATS } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import { atan2B, cosB, sinB, TRIG_ONE } from '../math/trig';
import type { SimState } from '../state';
import { nearestPlayer } from './horde';

// Enemy attacks for the readability test: fans of bullets fired from random mobs near a
// player, and ground zones that warn first and then blast.

export function threatSystem(s: SimState, events: SimEvent[], hurt: (owner: number) => void): void {
  const p = THREATS;
  if (--s.volleyT <= 0) {
    s.volleyT += p.volleyEvery;
    fire(s);
  }
  if (--s.zoneT <= 0) {
    s.zoneT += p.zoneEvery;
    place(s);
  }

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
        hurt(pl.owner);
        hit = true;
      }
    }
    if (!hit && b.age < p.bulletLife) s.bullets[w++] = b;
  }
  s.bullets.length = w;

  w = 0;
  for (const z of s.zones) {
    z.age++;
    if (z.age < p.warn) {
      s.zones[w++] = z;
      continue;
    }
    events.push({ type: 'blast', x: z.x, y: z.y, radius: z.radius });
    for (const pl of s.players) if (dist2(z.x - pl.x, z.y - pl.y) < z.radius * z.radius) hurt(pl.owner);
  }
  s.zones.length = w;
}

/** A fan of bullets from a random mob in range of its nearest player, aimed at that player. */
function fire(s: SimState): void {
  const p = THREATS;
  if (s.mobs.length === 0) return;
  for (let k = 0; k < p.picks; k++) {
    const m = s.mobs[s.ai.int(s.mobs.length)];
    const t = nearestPlayer(s.players, m.x, m.y);
    const dx = t.x - m.x;
    const dy = t.y - m.y;
    const d = dist(dx, dy);
    if (d > p.range || d < 100) continue;
    const aim = atan2B(dy, dx);
    for (let i = 0; i < p.fan; i++) {
      const a = aim + Math.trunc(((2 * i - (p.fan - 1)) * p.fanStep) / 2);
      const vx = Math.trunc((cosB(a) * p.bulletSpeed) / TRIG_ONE);
      const vy = Math.trunc((sinB(a) * p.bulletSpeed) / TRIG_ONE);
      s.bullets.push({ x: m.x, y: m.y, px: m.x, py: m.y, vx, vy, age: 0 });
    }
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
    x: t.x + Math.trunc((cosB(a) * r) / TRIG_ONE), y: t.y + Math.trunc((sinB(a) * r) / TRIG_ONE), radius: p.zoneRadius, age: 0,
  });
}
