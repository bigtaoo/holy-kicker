import { ARENA, arenaRun } from '../arena';
import type { SimEvent } from '../events';
import { asKick, KICK, type Flyer } from '../kick';
import type { MobKind } from '../config';
import { dist, dist2 } from '../math/fixed';
import { atan2B, cosB, normBrad, sinB, TRIG_ONE } from '../math/trig';
import type { Player } from '../player';
import type { SimState } from '../state';
import { choosing } from './build';
import { bossIndex, damage, downMob, eliteAt, targetAt } from './combat';
import { superArmor } from './elite';

// The Holy Kick's rules (kick.ts holds the numbers): the kick itself, from a player's command,
// and the kicked bodies' flight, one step after the relic's ball.

/** p kicks the nearest mob in reach if the charge is full; false when nothing happened. */
export function holyKick(s: SimState, events: SimEvent[], p: Player): boolean {
  if (!s.flyers || p.charge !== KICK.full || p.dead || s.outcome !== 'playing' || choosing(s)) return false;
  const i = kickable(s, p);
  if (i < 0) return false;
  const m = s.mobs[i];
  let dx = m.x - p.x;
  const dy = m.y - p.y;
  if (dx === 0 && dy === 0) dx = p.facing;
  const d = dist(dx, dy) || 1;
  const vx = Math.trunc((dx * KICK.speed) / d);
  const vy = Math.trunc((dy * KICK.speed) / d);
  const { kind, x, y } = m;
  p.charge = 0;
  p.chain = 0;
  if (dx !== 0) p.facing = dx < 0 ? -1 : 1;
  // the kick pose, without the relic's own strike
  p.action = 'kick';
  p.actionT = 0;
  p.struck = true;
  asKick(() => downMob(s, events, i, p, true));
  const f = launch(s, events, p, kind, x, y, vx, vy, i);
  events.push({ type: 'holyKick', owner: p.owner, id: f.id, x, y, dx: vx, dy: vy });
  return true;
}

/** The nearest mob within KICK.reach on the side p faces, else on either side; -1 if none. */
export function kickable(s: SimState, p: Player): number {
  let best = -1;
  let behind = -1;
  let bestD = KICK.reach * KICK.reach;
  let behindD = bestD;
  for (let i = 0; i < s.mobs.length; i++) {
    const t = targetAt(s, i);
    if (!t) continue;
    const d = dist2(t.x - p.x, t.y - p.y);
    if ((t.x - p.x) * p.facing >= 0) {
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    } else if (d < behindD) {
      behindD = d;
      behind = i;
    }
  }
  return best >= 0 ? best : behind;
}

function launch(s: SimState, events: SimEvent[], p: Player, kind: MobKind, x: number, y: number, vx: number, vy: number, from: number): Flyer {
  const f: Flyer = { id: s.nextId++, owner: p.owner, kind, x, y, px: x, py: y, vx, vy, travel: KICK.range, hit: [from] };
  s.flyers!.push(f);
  p.chain = (p.chain ?? 0) + 1;
  events.push({ type: 'kickChain', owner: p.owner, n: p.chain, x, y });
  return f;
}

/** Moves every kicked body; a kick's last body coming down ends its chain (kickEnd). */
export function flyerSystem(s: SimState, events: SimEvent[]): void {
  const list = s.flyers;
  if (!list) return;
  if (list.length > 0) {
    asKick(() => {
      // bodies launched this tick are appended past n and fly from the next tick
      const n = list.length;
      let w = 0;
      for (let k = 0; k < n; k++) if (fly(s, events, list[k])) list[w++] = list[k];
      for (let k = n; k < list.length; k++) list[w++] = list[k];
      list.length = w;
    });
  }
  for (const p of s.players) {
    if (!p.chain || list.some((f) => f.owner === p.owner)) continue;
    events.push({ type: 'kickEnd', owner: p.owner, n: p.chain });
    p.chain = 0;
  }
}

/** One step of body f; false once it is down. */
function fly(s: SimState, events: SimEvent[], f: Flyer): boolean {
  const p = s.players.find((q) => q.owner === f.owner);
  if (!p) return false;
  f.px = f.x;
  f.py = f.y;
  f.x += f.vx;
  f.y += f.vy;
  f.travel -= KICK.speed;
  if (arenaRun(s.config)) {
    const lim = ARENA.half - ARENA.inset;
    if (Math.abs(f.x) > lim || Math.abs(f.y) > lim) {
      f.x = Math.max(-lim, Math.min(lim, f.x));
      f.y = Math.max(-lim, Math.min(lim, f.y));
      burst(s, events, p, f, true);
      return false;
    }
  }
  const last = bossIndex(s);
  for (let i = 0; i <= last; i++) {
    if (f.hit.includes(i)) continue;
    const t = targetAt(s, i);
    if (!t) continue;
    const big = i >= s.mobs.length;
    const reach = big ? 2 * KICK.radius : KICK.radius;
    if (dist2(t.x - f.x, t.y - f.y) > reach * reach) continue;
    const src = { x: f.px, y: f.py };
    if (big) {
      const e = eliteAt(s, i);
      hurt(s, events, i, p, KICK.bigDamage, true, src);
      if (e && e.hp > 0 && !superArmor(e)) e.stun = Math.max(e.stun, KICK.stun);
      burst(s, events, p, f, false);
      return false;
    }
    f.hit.push(i);
    const { kind, x, y } = s.mobs[i];
    const before = events.length;
    hurt(s, events, i, p, KICK.damage, false, src);
    if (felled(events, before, i) && (p.chain ?? 0) < KICK.bodies) {
      const a = normBrad(atan2B(f.vy, f.vx) + s.combat.range(-KICK.spread, KICK.spread));
      launch(s, events, p, kind, x, y, Math.trunc((cosB(a) * KICK.speed) / TRIG_ONE), Math.trunc((sinB(a) * KICK.speed) / TRIG_ONE), i);
    }
    if (f.hit.length > KICK.pierce) return false;
  }
  return f.travel > 0;
}

/** A hit by the kick (combat.ts damage), its damage tallied on the kicker. */
function hurt(s: SimState, events: SimEvent[], i: number, p: Player, pct: number, knock: boolean, src: { x: number; y: number }): void {
  const before = events.length;
  damage(s, events, i, p, null, pct, knock, src);
  for (let k = before; k < events.length; k++) {
    const e = events[k];
    if (e.type === 'hit' && e.index === i) p.kickDealt = (p.kickDealt ?? 0) + e.value;
  }
}

/** Whether mob i went down among the events pushed since `from`. */
function felled(events: readonly SimEvent[], from: number, i: number): boolean {
  for (let k = from; k < events.length; k++) {
    const e = events[k];
    if (e.type === 'mobDown' && e.index === i) return true;
  }
  return false;
}

/** Body f bursts: KICK.burstDamage to every mob within KICK.burstRadius it has not flown through. */
function burst(s: SimState, events: SimEvent[], p: Player, f: Flyer, wall: boolean): void {
  events.push({ type: 'kickBurst', owner: p.owner, x: f.x, y: f.y, radius: KICK.burstRadius, wall });
  const r2 = KICK.burstRadius * KICK.burstRadius;
  const src = { x: f.x, y: f.y };
  for (let i = 0; i < s.mobs.length; i++) {
    const t = targetAt(s, i);
    if (!t || f.hit.includes(i) || dist2(t.x - f.x, t.y - f.y) > r2) continue;
    hurt(s, events, i, p, KICK.burstDamage, false, src);
  }
}
