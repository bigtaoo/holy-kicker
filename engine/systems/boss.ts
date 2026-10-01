import { BOSS, HURT } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import { cosB, sinB, TRIG_ONE } from '../math/trig';
import { body, teleport, type Boss, type SimState } from '../state';
import { nearestPlayer } from './horde';

// The boss lumbers after the nearest player and, once close, winds up a two-fisted slam on a
// marked circle in front of it. The circle shows for the whole wind-up so the player can step
// out; after the slam it stands winded for a moment. Defeated, it lies down; in a chapter it
// is then gone (systems/waves.ts), in the sandbox it comes back later from a random side.

export function newBoss(x: number, y: number, hp = BOSS.hp): Boss {
  return { ...body(x, y), phase: 'walk', t: 0, cooldown: BOSS.cooldown, zoneX: x, zoneY: y, hp, maxHp: hp };
}

/** Takes damage; true when this blow brings it down. */
export function hurtBoss(b: Boss, value: number): boolean {
  const was = b.hp;
  b.hp = Math.max(0, b.hp - value);
  return was > 0 && b.hp === 0;
}

/** Steps the boss; calls `hurt` for every player the slam lands on. */
export function bossSystem(s: SimState, events: SimEvent[], hurt: (owner: number, value: number) => void): void {
  const b = s.boss;
  if (!b) return;
  b.px = b.x;
  b.py = b.y;
  b.t++;
  const target = nearestPlayer(s.players, b.x, b.y);
  if (b.phase === 'down') {
    if (b.t < BOSS.respawnAfter) return;
    if (s.config.waves > 0) {
      s.boss = null;
      return;
    }
    const a = s.ai.int(65536);
    const back = newBoss(
      target.x + Math.trunc((cosB(a) * BOSS.respawnDist) / TRIG_ONE),
      target.y + Math.trunc((sinB(a) * BOSS.respawnDist) / TRIG_ONE),
      b.maxHp,
    );
    Object.assign(b, back);
    teleport(b, back.x, back.y);
    events.push({ type: 'bossBack' });
    return;
  }
  const dx = target.x - b.x;
  const dy = target.y - b.y;
  const d = dist(dx, dy);
  if (b.phase === 'walk') {
    b.cooldown--;
    if (d > BOSS.stopDist) {
      const step = Math.min(BOSS.speed, d - BOSS.stopDist);
      b.x += Math.trunc((dx * step) / d);
      b.y += Math.trunc((dy * step) / d);
    }
    if (b.cooldown <= 0 && d <= BOSS.slamRange) {
      // aim at the player, but never further out than the arms reach
      const reach = Math.min(d, BOSS.slamReach);
      b.zoneX = b.x + (d > 0 ? Math.trunc((dx * reach) / d) : 0);
      b.zoneY = b.y + (d > 0 ? Math.trunc((dy * reach) / d) : 0);
      b.phase = 'windup';
      b.t = 0;
      events.push({ type: 'bossWindup' });
    }
    return;
  }
  if (b.phase === 'windup') {
    if (b.t < BOSS.windup) return;
    b.phase = 'recover';
    b.t = 0;
    events.push({ type: 'bossSlam', x: b.zoneX, y: b.zoneY, radius: BOSS.slamRadius });
    const r2 = BOSS.slamRadius * BOSS.slamRadius;
    for (const p of s.players) if (dist2(p.x - b.zoneX, p.y - b.zoneY) <= r2) hurt(p.owner, HURT.slam);
    return;
  }
  if (b.t >= BOSS.recover) {
    b.phase = 'walk';
    b.t = 0;
    b.cooldown = BOSS.cooldown;
  }
}
