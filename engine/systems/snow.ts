import { CASTER, HURT, MOB_KINDS, WITCH, WOLF_LEADER, tempKind } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import { newMob, teleport, underground, type Elite, type Mob, type SimState } from '../state';
import { nearestPlayer } from './horde';
import { mobHp } from './waves';

// Chapter 3's mob mechanics (docs/content.md "Enemies"): the ice wraith, a zone caster, stops
// at range and every few seconds marks a frost circle where the hero stands, which goes off
// after the usual warning; the wolf leader's howl sends the mobs around it running fast; the
// Bone Witch's skeletons split into two bone crawlers when they fall. Skeletons and shards
// fall for good: they lie under the ground (health 0) and are reused by the next summons, so
// the horde does not grow without end.

/**
 * Casters count down to their circle, but only raise their arms (the last `windup`) with their
 * hero in range; once raised they cast whatever he does. A stunned one waits.
 */
export function casterSystem(s: SimState): void {
  for (const m of s.mobs) {
    if (m.kind !== 'caster' || m.stun > 0 || underground(m)) continue;
    const p = nearestPlayer(s.players, m.x, m.y);
    if (m.t === CASTER.windup + 1 && dist(p.x - m.x, p.y - m.y) > CASTER.range) continue;
    if (--m.t > 0) continue;
    s.zones.push({ x: p.x, y: p.y, radius: CASTER.radius, age: 0, hurt: HURT.frost });
    m.t = CASTER.cooldown + s.ai.int(CASTER.spread + 1);
  }
}

/** Mob i's speed this tick: its kind's, raised while a howl drives it. */
export function mobSpeed(m: Mob): number {
  const v = MOB_KINDS[m.kind].speed;
  return m.haste > 0 ? Math.trunc((v * WOLF_LEADER.hastePercent) / 100) : v;
}

/** The wolf leader howls: every mob standing within reach of it runs fast for a while. */
export function howl(s: SimState, e: Elite, events: SimEvent[]): void {
  const r2 = WOLF_LEADER.howlRadius * WOLF_LEADER.howlRadius;
  for (const m of s.mobs) if (!underground(m) && dist2(m.x - e.x, m.y - e.y) < r2) m.haste = WOLF_LEADER.haste;
  events.push({ type: 'howl', x: e.x, y: e.y, radius: WOLF_LEADER.howlRadius });
}

/** A skeleton fell at (x, y): its shards join at the end of the tick, side by side. */
export function split(s: SimState, x: number, y: number): void {
  for (let k = 0; k < WITCH.shards; k++) {
    const off = Math.trunc(((2 * k - (WITCH.shards - 1)) * WITCH.shardSpread) / Math.max(1, WITCH.shards - 1));
    s.spawns.push({ kind: 'shard', x: x + off, y });
  }
}

/** Skeletons standing now, and those joining at the end of the tick. */
export function skeletons(s: SimState): number {
  let n = 0;
  for (const m of s.mobs) if (m.kind === 'skeleton' && !underground(m)) n++;
  for (const sp of s.spawns) if (sp.kind === 'skeleton') n++;
  return n;
}

/**
 * The tick's spawns join the horde: a fallen mob of the same kind lying under the ground comes
 * back up, else a new one is added. Run last, so target numbers hold through the tick.
 */
export function spawnSystem(s: SimState): void {
  for (const sp of s.spawns) {
    let m = s.mobs.find((q) => q.kind === sp.kind && tempKind(q.kind) && q.hp === 0);
    if (!m) {
      m = newMob(0, 0, 1, sp.kind);
      s.mobs.push(m);
    }
    teleport(m, sp.x, sp.y);
    m.hp = mobHp(s.wave, sp.kind, s.config.chapter);
    m.stun = 0;
    m.haste = 0;
    m.t = 0;
  }
  s.spawns.length = 0;
}
