import { EMPOWERED_JUDGE, HURT, JUDGE } from '../config';
import type { SimEvent } from '../events';
import { dist } from '../math/fixed';
import { TRIG_ONE } from '../math/trig';
import type { Boss, Player, SimState } from '../state';
import { fan, ring } from './threats';

// The Underworld Judge, chapter 4's boss (docs/content.md "Chapters"): he keeps his distance
// and, every few seconds, raises his brush; then in turn he writes a line of zones from
// himself through the hero, going off one after another like a brush stroke, or flicks a fan
// of ink bullets at him. Brought below half his health he changes his verdicts: a cross of
// two lines through the hero, spreading out from him, and full rings of ink, more often.

/** Below JUDGE.ragePercent of his health: the cross and the rings. */
export function enraged(b: Boss): boolean {
  return b.hp * 100 <= b.maxHp * JUDGE.ragePercent;
}

/** Steps a judge that is not down; `target` is the nearest player. */
export function stepJudge(s: SimState, b: Boss, target: Player, events: SimEvent[]): void {
  const dx = target.x - b.x;
  const dy = target.y - b.y;
  const d = dist(dx, dy);
  if (b.phase === 'walk') {
    if (d > JUDGE.stopDist) {
      const step = Math.min(JUDGE.speed, d - JUDGE.stopDist);
      b.x += Math.trunc((dx * step) / d);
      b.y += Math.trunc((dy * step) / d);
    }
    if (--b.cooldown > 0 || target.dead || d > JUDGE.range) return;
    b.phase = 'windup';
    b.t = 0;
    b.zoneX = b.x;
    b.zoneY = b.y;
    events.push({ type: 'bossWindup' });
    return;
  }
  if (b.phase === 'windup') {
    if (b.t < JUDGE.windup) return;
    b.phase = 'recover';
    b.t = 0;
    const rage = enraged(b);
    // the way from him to the hero, a unit vector in TRIG_ONE
    const ux = d > 0 ? Math.trunc((dx * TRIG_ONE) / d) : TRIG_ONE;
    const uy = d > 0 ? Math.trunc((dy * TRIG_ONE) / d) : 0;
    if (b.shots++ % 2 === 0) {
      if (rage) {
        cross(s, target.x, target.y, ux, uy);
      } else {
        for (let j = 0; j < JUDGE.zones; j++) verdict(s, b.x, b.y, ux, uy, JUDGE.first + j * JUDGE.step, j);
      }
    } else if (rage) {
      ring(s, b.x, b.y, 0, JUDGE.ring, s.tick);
    } else {
      fan(s, b.x, b.y, target.x, target.y, JUDGE.fan);
    }
    events.push({ type: 'bossCast', x: b.x, y: b.y });
    return;
  }
  if (b.t >= JUDGE.recover) {
    b.phase = 'walk';
    b.t = 0;
    const k = b.empowered ? EMPOWERED_JUDGE : JUDGE;
    b.cooldown = enraged(b) ? k.rageCooldown : k.cooldown;
  }
}

/** Two lines through (x, y), along (ux, uy) and across it, going off from the middle out. */
function cross(s: SimState, x: number, y: number, ux: number, uy: number): void {
  const mid = (JUDGE.zones - 1) >> 1;
  for (let j = 0; j < JUDGE.zones; j++) verdict(s, x, y, ux, uy, (j - mid) * JUDGE.step, Math.abs(j - mid));
  for (let j = 0; j < JUDGE.zones; j++) if (j !== mid) verdict(s, x, y, -uy, ux, (j - mid) * JUDGE.step, Math.abs(j - mid));
}

/**
 * One zone of a verdict, `along` from (x, y) on (ux, uy), going off `order` staggers late (its
 * age starts below 0, so the warning runs that much longer).
 */
function verdict(s: SimState, x: number, y: number, ux: number, uy: number, along: number, order: number): void {
  s.zones.push({
    x: x + Math.trunc((ux * along) / TRIG_ONE),
    y: y + Math.trunc((uy * along) / TRIG_ONE),
    radius: JUDGE.radius,
    age: -order * JUDGE.stagger,
    hurt: HURT.verdict,
  });
}
