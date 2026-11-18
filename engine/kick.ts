import type { MobKind } from './config';
import { perTick, ticks, toFp } from './math/fixed';
import { BRAD_FULL } from './math/trig';
import type { SimEvent } from './events';
import type { Player } from './player';
import type { Body } from './state';

// The Holy Kick prototype (docs/kick-prototype.md): kills fill a charge; a full one lets the hero
// kick the nearest mob so hard that it flies off as a body that bowls through the horde, and a
// mob it fells flies on in turn. Only in runs with RunConfig.kick, whose state alone carries the
// charge (Player.charge) and the bodies in the air (SimState.flyers), so every other run hashes
// and replays as before. The rules are in systems/holyKick.ts.

export const KICK = {
  /** Kills that fill the charge (the kick's own kills do not count). */
  full: 40,
  /** A mob this far from the hero (centre to centre) can be kicked. */
  reach: toFp(320),
  /** A kicked body's speed and how far it flies before it drops. */
  speed: perTick(1600),
  range: toFp(1300),
  /** What a body touches as it flies: this far from its centre. */
  radius: toFp(75),
  /** Percent of a hit's damage (combat.ts damage) for each mob a body flies through. */
  damage: 300,
  /** Mobs one body flies through at most before it drops. */
  pierce: 8,
  /** Bodies in the air from one kick at most, the kicked one included (the chain's length). */
  bodies: 12,
  /** A felled mob flies on along its feller's line, turned by up to this either way. */
  spread: BRAD_FULL / 24,
  /** An elite or the boss stops a body: this percent of a hit, and an elite stands stunned this long. */
  bigDamage: 1500,
  stun: ticks(1),
  /** A body that meets an arena wall (or an elite or the boss) bursts: this percent to every mob this near. */
  burstDamage: 300,
  burstRadius: toFp(280),
};

/** A kicked mob in the air: its look (`kind`), velocity, travel left, mobs flown through and their target numbers. */
export interface Flyer extends Body {
  id: number;
  owner: number;
  kind: MobKind;
  vx: number;
  vy: number;
  travel: number;
  hit: number[];
}

/** True while a kick's bodies fly (systems/holyKick.ts): their kills do not fill the charge. */
let flying = false;

/** Runs `fn` as the kick's own doing. */
export function asKick<T>(fn: () => T): T {
  flying = true;
  try {
    return fn();
  } finally {
    flying = false;
  }
}

/** A kill by p (combat.ts downMob) fills one point of a kick run's charge. */
export function fillCharge(events: SimEvent[], p: Player): void {
  if (flying || p.charge === undefined || p.charge >= KICK.full) return;
  if (++p.charge === KICK.full) events.push({ type: 'kickReady', owner: p.owner });
}
