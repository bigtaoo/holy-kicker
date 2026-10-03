import { EMERGE, HURT, SHOOTER } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import { cosB, sinB, TRIG_ONE } from '../math/trig';
import { teleport, type Mob, type SimState } from '../state';
import { nearestPlayer } from './horde';
import { fan } from './threats';

// Chapter 2's mob mechanics (docs/content.md "Enemies"): the water ghost, an emerger, waits
// under the ground after it falls (and when it first joins), then marks a spot next to the
// hero and rises there; the toad, a shooter, stops at range and every few seconds swells and
// spits a fan of bullets at him.

/** Sets a mob's timer for a fresh start: joining the horde, or coming back after it fell. */
export function resetMob(s: SimState, m: Mob): void {
  if (m.kind === 'emerger') m.t = EMERGE.under + s.ai.int(EMERGE.underSpread + 1) + EMERGE.warn;
  else if (m.kind === 'shooter') m.t = SHOOTER.cooldown + s.ai.int(SHOOTER.spread + 1);
  else m.t = 0;
}

/**
 * Emergers under the ground count down; with `warn` left they move to a mark near their hero
 * (where it is then), and at 0 they rise, hurting a hero standing on the mark.
 */
export function emergeSystem(s: SimState, events: SimEvent[], hurt: (owner: number, value: number) => void): void {
  for (let i = 0; i < s.mobs.length; i++) {
    const m = s.mobs[i];
    if (m.kind !== 'emerger' || m.t <= 0) continue;
    m.t--;
    if (m.t === EMERGE.warn) {
      const p = nearestPlayer(s.players, m.x, m.y);
      const a = s.ai.int(65536);
      const r = s.ai.range(EMERGE.near, EMERGE.far);
      teleport(m, p.x + Math.trunc((cosB(a) * r) / TRIG_ONE), p.y + Math.trunc((sinB(a) * r) / TRIG_ONE));
    }
    if (m.t > 0) continue;
    events.push({ type: 'emerge', index: i, x: m.x, y: m.y });
    const grab2 = EMERGE.grab * EMERGE.grab;
    for (const p of s.players) if (!p.dead && dist2(p.x - m.x, p.y - m.y) < grab2) hurt(p.owner, HURT.emerge);
  }
}

/**
 * Shooters count down to their volley, but only swell (the last `windup`) with their hero in
 * range; once swelling they fire whatever he does. A stunned one waits.
 */
export function shooterSystem(s: SimState): void {
  for (const m of s.mobs) {
    if (m.kind !== 'shooter' || m.stun > 0) continue;
    const p = nearestPlayer(s.players, m.x, m.y);
    if (m.t === SHOOTER.windup + 1 && dist(p.x - m.x, p.y - m.y) > SHOOTER.range) continue;
    if (--m.t > 0) continue;
    fan(s, m.x, m.y, p.x, p.y);
    m.t = SHOOTER.cooldown + s.ai.int(SHOOTER.spread + 1);
  }
}
