import { DOOR_GOD, EFFIGY, HURT, THREATS, type MobKind } from '../config';
import { dist } from '../math/fixed';
import { atan2B, BRAD_FULL, BRAD_HALF, cosB, sinB, TRIG_ONE } from '../math/trig';
import { underground, type Elite, type SimState } from '../state';
import { nearestPlayer, stepHorde, walkSpeed } from './horde';

// Chapter 4's mechanics (docs/content.md "Chapters", the Ghost Market): the paper effigy, a
// splitter, tears into paper scraps when it falls (they fall for good, like the witch's
// shards); the door god, the chapter's elite, a shielder: its shield takes the relic's hits
// from the front (spells still hit), it turns slowly, so going round it opens it up, and after
// its halberd comes down it stands winded with its shield lowered. Its lantern ghosts and
// long-tongue ghosts are chapter 2's shooter and emerger (systems/marsh.ts).

/** `n` mobs of `kind` join at the end of the tick, side by side `spread` apart around (x, y). */
export function splitInto(s: SimState, kind: MobKind, n: number, spread: number, x: number, y: number): void {
  for (let k = 0; k < n; k++) {
    const off = Math.trunc(((2 * k - (n - 1)) * spread) / Math.max(1, n - 1));
    s.spawns.push({ kind, x: x + off, y });
  }
}

/** Mobs of `kind` standing now, and those joining at the end of the tick. */
export function standing(s: SimState, kind: MobKind): number {
  let n = 0;
  for (const m of s.mobs) if (m.kind === kind && !underground(m)) n++;
  for (const sp of s.spawns) if (sp.kind === kind) n++;
  return n;
}

/** An effigy fell at (x, y): it tears into scraps, as many as there is room for. */
export function tear(s: SimState, x: number, y: number): void {
  const n = Math.min(EFFIGY.scraps, EFFIGY.maxScraps - standing(s, 'scrap'));
  if (n > 0) splitInto(s, 'scrap', n, EFFIGY.spread, x, y);
}

/**
 * True when a relic hit coming from (x, y) is taken by elite e's shield: a door god that is
 * not winded, facing within DOOR_GOD.blockHalf of the hit's source.
 */
export function shielded(e: Elite, x: number, y: number): boolean {
  if (e.kind !== 'doorGod' || e.phase === 'rest') return false;
  const rx = x - e.x;
  const ry = y - e.y;
  return e.vx * rx + e.vy * ry >= cosB(DOOR_GOD.blockHalf) * dist(rx, ry);
}

/** The door god's facing (vx, vy, a unit vector in TRIG_ONE) turned at most DOOR_GOD.turn toward (x, y). */
function turnTo(e: Elite, x: number, y: number): void {
  if (x === e.x && y === e.y) return;
  const want = atan2B(y - e.y, x - e.x);
  const now = e.vx === 0 && e.vy === 0 ? want : atan2B(e.vy, e.vx);
  // the signed difference, -half..half
  const diff = ((want - now + BRAD_HALF + BRAD_FULL) % BRAD_FULL) - BRAD_HALF;
  const a = now + Math.max(-DOOR_GOD.turn, Math.min(DOOR_GOD.turn, diff));
  e.vx = cosB(a);
  e.vy = sinB(a);
}

/**
 * The door god: it walks at its hero turning slowly, and with him in range and its cooldown
 * done raises its halberd (aim) over the circle ahead of where it faces, which goes off after
 * the usual warning; then it stands winded (rest), shield down. A stun freezes it in any phase.
 */
export function stepDoorGod(s: SimState, e: Elite): void {
  const k = DOOR_GOD;
  if (e.cd > 0) e.cd--;
  e.t++;
  const p = nearestPlayer(s.players, e.x, e.y);
  if (e.phase === 'aim') {
    if (e.t < THREATS.warn) return;
    e.phase = 'rest';
    e.t = 0;
  } else if (e.phase === 'rest') {
    if (e.t < k.rest) return;
    e.phase = 'walk';
    e.t = 0;
    e.cd = k.cooldown;
  } else {
    turnTo(e, p.x, p.y);
    if (e.cd === 0 && !p.dead && dist(p.x - e.x, p.y - e.y) < k.range) {
      e.phase = 'aim';
      e.t = 0;
      e.shots++;
      const x = e.x + Math.trunc((e.vx * k.reach) / TRIG_ONE);
      const y = e.y + Math.trunc((e.vy * k.reach) / TRIG_ONE);
      s.zones.push({ x, y, radius: k.radius, age: 0, hurt: HURT.smash });
    } else {
      stepHorde([e], s.players, { speed: walkSpeed(s.players, e, k.speed), stopDist: k.stopDist, sep: 0, queue: false });
    }
  }
}
