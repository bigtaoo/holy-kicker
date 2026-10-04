import { CASTER, EMERGE, HURT, MONK, SHOOTER, TOAD_KING } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import { cosB, sinB, TRIG_ONE } from '../math/trig';
import { teleport, type Elite, type Mob, type SimState } from '../state';
import { nearestPlayer, stepHorde } from './horde';
import { fan } from './threats';

// Chapter 2's mob mechanics (docs/content.md "Enemies"): the water ghost, an emerger, waits
// under the ground after it falls (and when it first joins), then marks a spot next to the
// hero and rises there; the toad, a shooter, stops at range and every few seconds swells and
// spits a fan of bullets at him. The toad king, its elite, does both bigger: wide fans, and
// poison pools that mark the ground under the hero.

/** Sets a mob's timer for a fresh start: joining the horde, or coming back after it fell. */
export function resetMob(s: SimState, m: Mob): void {
  if (m.kind === 'emerger') m.t = EMERGE.under + s.ai.int(EMERGE.underSpread + 1) + EMERGE.warn;
  else if (m.kind === 'shooter') m.t = SHOOTER.cooldown + s.ai.int(SHOOTER.spread + 1);
  else if (m.kind === 'caster') m.t = CASTER.cooldown + s.ai.int(CASTER.spread + 1);
  else if (m.kind === 'monk') m.t = MONK.blocks;
  else m.t = 0;
  m.haste = 0;
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

/**
 * The toad king, chapter 2's elite: it walks to TOAD_KING.stopDist from its hero and, with him
 * in range and its cooldown done, swells (aim) and spits, in turn a wide fan of bullets at him
 * or poison pools on and around him, then sits (rest). A stun freezes it in any phase.
 */
export function stepToadKing(s: SimState, e: Elite): void {
  const k = TOAD_KING;
  if (e.cd > 0) e.cd--;
  e.t++;
  const p = nearestPlayer(s.players, e.x, e.y);
  if (e.phase === 'aim') {
    if (e.t < k.windup) return;
    if (e.shots++ % 2 === 0) fan(s, e.x, e.y, p.x, p.y, k.fan);
    else pools(s, p.x, p.y);
    e.phase = 'rest';
    e.t = 0;
  } else if (e.phase === 'rest') {
    if (e.t < k.rest) return;
    e.phase = 'walk';
    e.t = 0;
    e.cd = k.cooldown;
  } else if (e.cd === 0 && !p.dead && dist(p.x - e.x, p.y - e.y) < k.range) {
    e.phase = 'aim';
    e.t = 0;
  } else {
    stepHorde([e], s.players, { speed: k.speed, stopDist: k.stopDist, sep: 0, queue: false });
  }
}

/** The toad king's pools: one on (x, y), the rest around it. */
function pools(s: SimState, x: number, y: number): void {
  const k = TOAD_KING;
  for (let i = 0; i < k.pools; i++) {
    const a = s.ai.int(65536);
    const r = i === 0 ? 0 : s.ai.range(k.poolRadius, k.poolSpread);
    s.zones.push({ x: x + Math.trunc((cosB(a) * r) / TRIG_ONE), y: y + Math.trunc((sinB(a) * r) / TRIG_ONE), radius: k.poolRadius, age: 0, hurt: HURT.pool });
  }
}
