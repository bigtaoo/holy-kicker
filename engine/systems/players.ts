import { HERO, HURT } from '../config';
import type { SimEvent } from '../events';
import { MAG_FULL, type PlayerCommand } from '../input';
import { dist2, FP } from '../math/fixed';
import { cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Player, SimState } from '../state';
import { bowlLevel, pickCard, relicCooldown, relicLevel, stat } from './build';
import { bowlInAir, throwBowl } from './bowl';
import { bossIndex, kickTarget, launchBall, nearestTarget, targetAt } from './combat';
import { ringPoint } from './horde';
import { breakBell } from './spells';
import { fishStart, tap } from './fish';
import { staffStart, sweep } from './staff';

// The hero: moves with the stick (easing into and out of a run), auto-kicks the cuju at the
// nearest enemy (the boss first) or swings the staff when one comes close (systems/staff.ts) or taps the wooden fish (systems/fish.ts) or throws the alms bowl (systems/bowl.ts) (prayer beads circle him: systems/beads.ts), and loses health when something reaches him (at most one
// blow per hurt cooldown; a Golden Bell takes the blow instead). Kick and hurt are one-shot actions; hurt interrupts a kick before
// its foot meets the ball. At 0 health he is down until a revive; the sandbox (waves 0) only
// flinches.

export function applyInput(s: SimState, events: SimEvent[], cmds: readonly PlayerCommand[]): void {
  for (const c of cmds) {
    const p = s.players.find((q) => q.owner === c.owner);
    if (!p) continue;
    p.moveBrad = c.moveBrad & 65535;
    p.moveMag = Math.max(0, Math.min(MAG_FULL, c.moveMag | 0));
    if (c.revive && p.dead && p.revives > 0) revive(s, events, p);
    if (c.pick !== undefined) pickCard(s, events, p, c.pick | 0);
  }
}

/** Back on his feet at full health, briefly untouchable, with the nearby horde sent away. */
function revive(s: SimState, events: SimEvent[], p: Player): void {
  p.revives--;
  p.dead = false;
  p.hp = p.maxHp;
  p.hurtCd = HERO.reviveGuard;
  const r2 = HERO.reviveClear * HERO.reviveClear;
  for (const m of s.mobs) if (dist2(m.x - p.x, m.y - p.y) < r2) ringPoint(s.ai, p.x, p.y, m);
  if (s.outcome === 'lost') s.outcome = 'playing';
  events.push({ type: 'revive', owner: p.owner });
}

export function movePlayers(s: SimState): void {
  const ease = s.config.heroEase;
  for (const p of s.players) {
    p.px = p.x;
    p.py = p.y;
    if (p.dead) {
      p.vx = p.vy = 0;
      p.moving = false;
      continue;
    }
    const top = Math.trunc((HERO.speed * (100 + stat(p, 'speed'))) / 100);
    const speed = Math.trunc((p.moveMag * top) / MAG_FULL);
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

/** What a hurt of `value` takes in chapter `chapter` (HURT.chapterPercent). */
export function chapterHurt(chapter: number, value: number): number {
  const pct = HURT.chapterPercent[Math.min(Math.max(chapter, 1), HURT.chapterPercent.length) - 1];
  return Math.trunc((value * pct) / 100);
}

export function hurtPlayer(s: SimState, events: SimEvent[], owner: number, value: number): void {
  const p = s.players.find((q) => q.owner === owner);
  if (!p || p.dead || p.hurtCd > 0) return;
  if (breakBell(s, events, p)) return;
  // Focus keeps the hero untouchable a little longer
  p.hurtCd = Math.trunc((HERO.hurtCooldown * (100 + stat(p, 'guard'))) / 100);
  p.action = 'hurt';
  p.actionT = 0;
  const dealt = s.config.waves > 0 ? Math.min(p.hp, chapterHurt(s.config.chapter, value)) : 0;
  p.hp -= dealt;
  events.push({ type: 'hurt', owner, value: dealt });
  if (p.hp > 0) return;
  p.dead = true;
  p.action = 'none';
  events.push({ type: 'heroDown', owner });
}

/** Kick timing: start a kick at a target in range, launch the ball when the foot connects. */
export function kickSystem(s: SimState, events: SimEvent[]): void {
  for (const p of s.players) {
    if (p.dead) continue;
    if (p.kickCd > 0) p.kickCd--;
    if (p.hurtCd > 0) p.hurtCd--;
    if (p.action !== 'none') {
      p.actionT++;
      if (p.action === 'kick' && !p.struck && p.actionT >= HERO.strikeAt) {
        p.struck = true;
        if (p.relicId === 'staff') sweep(s, events, p);
        else if (p.relicId === 'fish') tap(s, events, p);
        else if (p.relicId === 'bowl') throwBowl(s, p);
        else strike(s, p);
      }
      if (p.actionT >= (p.action === 'kick' ? HERO.kickTicks : HERO.hurtTicks)) p.action = 'none';
    }
    // the prayer beads turn by themselves (systems/beads.ts)
    if (p.relicId === 'beads' || p.kickCd > 0 || p.action !== 'none') continue;
    // one alms bowl in the air at a time (systems/bowl.ts)
    if (p.relicId === 'bowl' && bowlInAir(s, p)) continue;
    const t = kickTarget(s, p, attackRange(p));
    if (t < 0) continue;
    const dx = targetAt(s, t)!.x - p.x;
    if (dx !== 0) p.facing = dx < 0 ? -1 : 1;
    p.action = 'kick';
    p.actionT = 0;
    p.struck = false;
    p.kickCd = relicCooldown(p);
    events.push({ type: 'kick', owner: p.owner, dir: p.facing });
  }
}

/** How close a target has to be for the relic to go off. */
function attackRange(p: Player): number {
  if (p.relicId === 'staff') return staffStart(p);
  if (p.relicId === 'fish') return fishStart(p);
  if (p.relicId === 'bowl') return bowlLevel(p).reach;
  return HERO.kickRange;
}

/** The foot meets the ball: launch it from the foot at the target, or straight ahead. */
function strike(s: SimState, p: Player): void {
  const t = kickTarget(s, p, HERO.strikeRange);
  const fx = p.x + p.facing * HERO.footOffset;
  const target = t >= 0 ? targetAt(s, t)! : null;
  const r = relicLevel(p);
  launchBall(s, p.owner, fx, p.y, target ? target.x : fx + p.facing * 100 * FP, target ? target.y : p.y, r.hits, r.damage, p.awakened);
}

/** Anything touching a player hurts them, by what it is; the horde hits harder in later waves. */
export function contactSystem(s: SimState, events: SimEvent[]): void {
  for (const p of s.players) {
    if (p.dead) continue;
    const t = nearestTarget(s, p.x, p.y, HERO.hurtDist);
    if (t < 0) continue;
    const value = t < s.mobs.length
      ? s.mobs[t].kind === 'swarm' || s.mobs[t].kind === 'shard' ? HURT.swarm : HURT.mob + Math.trunc(s.wave / 10) * HURT.mobPerTenWaves
      : t < bossIndex(s) ? HURT.elite : HURT.boss;
    hurtPlayer(s, events, p.owner, value);
  }
}
