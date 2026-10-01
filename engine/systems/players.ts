import { HERO } from '../config';
import type { SimEvent } from '../events';
import { MAG_FULL, type PlayerCommand } from '../input';
import { FP } from '../math/fixed';
import { cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Player, SimState } from '../state';
import { kickTarget, launchBall, nearestTarget, targetAt } from './combat';

// The hero: moves with the stick (easing into and out of a run), auto-kicks the cuju at the
// nearest enemy (the boss first), and flinches when something reaches him. Kick and hurt are
// one-shot actions; hurt interrupts a kick before its foot meets the ball.

export function applyInput(s: SimState, cmds: readonly PlayerCommand[]): void {
  for (const c of cmds) {
    const p = s.players.find((q) => q.owner === c.owner);
    if (!p) continue;
    p.moveBrad = c.moveBrad & 65535;
    p.moveMag = Math.max(0, Math.min(MAG_FULL, c.moveMag | 0));
  }
}

export function movePlayers(s: SimState): void {
  const ease = s.config.heroEase;
  for (const p of s.players) {
    p.px = p.x;
    p.py = p.y;
    const speed = Math.trunc((p.moveMag * HERO.speed) / MAG_FULL);
    const cos = cosB(p.moveBrad);
    const tx = Math.trunc((cos * speed) / TRIG_ONE);
    const ty = Math.trunc((sinB(p.moveBrad) * speed) / TRIG_ONE);
    p.vx += Math.trunc(((tx - p.vx) * ease) / 1000);
    p.vy += Math.trunc(((ty - p.vy) * ease) / 1000);
    p.x += p.vx;
    p.y += p.vy;
    p.moving = p.moveMag > HERO.moveMag;
    if (p.action === 'none' && p.moveMag > 0 && cos !== 0) p.facing = cos < 0 ? -1 : 1;
  }
}

export function hurtPlayer(s: SimState, events: SimEvent[], owner: number): void {
  const p = s.players.find((q) => q.owner === owner);
  if (!p || p.hurtCd > 0) return;
  p.hurtCd = HERO.hurtCooldown;
  p.action = 'hurt';
  p.actionT = 0;
  events.push({ type: 'hurt', owner });
}

/** Kick timing: start a kick at a target in range, launch the ball when the foot connects. */
export function kickSystem(s: SimState, events: SimEvent[]): void {
  for (const p of s.players) {
    if (p.kickCd > 0) p.kickCd--;
    if (p.hurtCd > 0) p.hurtCd--;
    if (p.action !== 'none') {
      p.actionT++;
      if (p.action === 'kick' && !p.struck && p.actionT >= HERO.strikeAt) {
        p.struck = true;
        strike(s, p);
      }
      if (p.actionT >= (p.action === 'kick' ? HERO.kickTicks : HERO.hurtTicks)) p.action = 'none';
    }
    if (p.kickCd > 0 || p.action !== 'none') continue;
    const t = kickTarget(s, p, HERO.kickRange);
    if (t < 0) continue;
    const dx = targetAt(s, t)!.x - p.x;
    if (dx !== 0) p.facing = dx < 0 ? -1 : 1;
    p.action = 'kick';
    p.actionT = 0;
    p.struck = false;
    p.kickCd = HERO.kickCooldown;
    events.push({ type: 'kick', owner: p.owner, dir: p.facing });
  }
}

/** The foot meets the ball: launch it from the foot at the target, or straight ahead. */
function strike(s: SimState, p: Player): void {
  const t = kickTarget(s, p, HERO.strikeRange);
  const fx = p.x + p.facing * HERO.footOffset;
  const target = t >= 0 ? targetAt(s, t)! : null;
  launchBall(s, p.owner, fx, p.y, target ? target.x : fx + p.facing * 100 * FP, target ? target.y : p.y);
}

/** Anything touching a player hurts them (once a second at most). */
export function contactSystem(s: SimState, events: SimEvent[]): void {
  for (const p of s.players) {
    if (nearestTarget(s, p.x, p.y, HERO.hurtDist) >= 0) hurtPlayer(s, events, p.owner);
  }
}
