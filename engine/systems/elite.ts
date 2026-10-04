import { ELITE, HURT, WOLF_LEADER } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import type { Elite, SimState } from '../state';
import { nearestPlayer, stepHorde } from './horde';
import { stepToadKing } from './marsh';
import { stepDoorGod } from './ghost';
import { howl } from './snow';

// The elite, a charger (docs/content.md "Enemies"): it walks at the nearest hero, and once
// one is within ELITE.chargeRange and its cooldown is done it stops and marks a lane at him
// for ELITE.aim (the view draws it), then dashes ELITE.dashLength along that lane, hurting a
// hero it passes within ELITE.laneHalf, and stands for ELITE.rest before walking again. The
// lane is fixed when it aims, so stepping aside is the answer. A stun freezes it in any phase.
// Several elites (the mid-boss twins) take turns: one aims only while no other is charging.
// Chapter 2's toad king (systems/marsh.ts) shoots instead. Chapter 3's wolf leader charges
// faster and, every other time, howls instead (systems/snow.ts): the mobs around it run fast.
// Chapter 4's door god shields itself and smashes (systems/ghost.ts).

export type HurtFn = (owner: number, value: number) => void;

/** Ticks a charge lasts. */
export const DASH_TICKS = Math.ceil(ELITE.dashLength / ELITE.dashSpeed);

export function eliteSystem(s: SimState, events: SimEvent[], hurt: HurtFn): void {
  for (const e of s.elites) stepElite(s, e, events, hurt);
}

function charging(e: Elite): boolean {
  return (e.kind === 'charger' || e.kind === 'wolfLeader') && (e.phase === 'aim' || e.phase === 'dash');
}

function stepElite(s: SimState, e: Elite, events: SimEvent[], hurt: HurtFn): void {
  e.px = e.x;
  e.py = e.y;
  if (e.stun > 0) {
    e.stun--;
    return;
  }
  if (e.kind === 'toadKing') return stepToadKing(s, e);
  if (e.kind === 'doorGod') return stepDoorGod(s, e);
  if (e.cd > 0) e.cd--;
  e.t++;
  if (e.phase === 'aim') {
    if (e.t >= ELITE.aim) enter(e, 'dash');
  } else if (e.phase === 'dash') {
    e.x += e.vx;
    e.y += e.vy;
    const lane2 = ELITE.laneHalf * ELITE.laneHalf;
    for (const p of s.players) if (!p.dead && dist2(p.x - e.x, p.y - e.y) < lane2) hurt(p.owner, HURT.charge);
    if (e.t >= DASH_TICKS) enter(e, 'rest');
  } else if (e.phase === 'rest') {
    if (e.t >= ELITE.rest) {
      enter(e, 'walk');
      e.cd = ELITE.cooldown;
    }
  } else if (e.phase === 'howl') {
    if (e.t < WOLF_LEADER.howl) return;
    howl(s, e, events);
    enter(e, 'walk');
    e.cd = ELITE.cooldown;
  } else {
    const p = nearestPlayer(s.players, e.x, e.y);
    const d = dist(p.x - e.x, p.y - e.y);
    const wolf = e.kind === 'wolfLeader';
    if (e.cd === 0 && !p.dead && d > 0 && d < ELITE.chargeRange && wolf && e.shots % 2 === 1) {
      e.shots++;
      enter(e, 'howl');
    } else if (e.cd === 0 && !p.dead && d > 0 && d < ELITE.chargeRange && !s.elites.some(charging)) {
      e.shots++;
      enter(e, 'aim');
      e.vx = Math.trunc(((p.x - e.x) * ELITE.dashSpeed) / d);
      e.vy = Math.trunc(((p.y - e.y) * ELITE.dashSpeed) / d);
    } else {
      stepHorde([e], s.players, { speed: wolf ? WOLF_LEADER.speed : ELITE.speed, stopDist: ELITE.stopDist, sep: 0, queue: false });
    }
  }
}

function enter(e: Elite, phase: Elite['phase']): void {
  e.phase = phase;
  e.t = 0;
}

/**
 * How far (x, y) is from the lane of a charge that is aimed or under way: the rest of the
 * path from where the elite is; -1 when it is not charging.
 */
export function laneDistance(e: Elite, x: number, y: number): number {
  if (!charging(e)) return -1;
  const left = e.phase === 'aim' ? ELITE.dashLength : Math.max(0, ELITE.dashLength - e.t * ELITE.dashSpeed);
  const rx = x - e.x;
  const ry = y - e.y;
  // the point's distance along the lane, clamped to the path left
  const along = Math.max(0, Math.min(left, Math.trunc((rx * e.vx + ry * e.vy) / ELITE.dashSpeed)));
  const cx = e.x + Math.trunc((e.vx * along) / ELITE.dashSpeed);
  const cy = e.y + Math.trunc((e.vy * along) / ELITE.dashSpeed);
  return dist(x - cx, y - cy);
}
