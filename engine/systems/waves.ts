import { ELITE, HORDE, MIX, MOB_KINDS, SHRINE, WAVES, type MobKind } from '../config';
import type { SimEvent } from '../events';
import { body, newElite, newMob, type SimState } from '../state';
import { newBoss } from './boss';
import { openShrine, payBet } from './build';
import { ringPoint } from './horde';

// The chapter's waves (docs/design.md "Chapters"): each lasts WAVES.ticks; the horde grows
// at the start of every wave (runners joining from MIX.runnerFrom, swarm packs on swarm
// waves), an elite comes every tenth wave, and the boss waves last until their boss falls:
// the mid-boss is two elites, the twin big jiangshi, and the last wave has the chapter boss. The chapter boss falling wins the run;
// every hero down loses it until a revive. Shrine waves open with the shrine cards. The
// sandbox (config.waves 0) skips all of this.

export function hordeSize(wave: number): number {
  return Math.min(WAVES.hordeMax, WAVES.hordeBase + WAVES.hordeStep * (wave - 1));
}

/** Health of a mob of `kind` that joins or comes back on wave `wave`; the sandbox (wave 0) horde has 1. */
export function mobHp(wave: number, kind: MobKind = 'chaser'): number {
  const n = wave - 1;
  const hp = wave > 0 ? HORDE.hp + Math.trunc((HORDE.hpStep * n + HORDE.hpSquare * n * n) / 1000) : 1;
  return Math.max(1, Math.trunc((hp * MOB_KINDS[kind].hpPercent) / 100));
}

/** Swarm waves bring a pack of swarm mobs (never a boss wave). */
export function isSwarmWave(wave: number, last: number): boolean {
  return wave >= MIX.swarmFrom && (wave - MIX.swarmFrom) % MIX.swarmEvery === 0 && !isBossWave(wave, last);
}

export function isBossWave(wave: number, last: number): boolean {
  return wave === last || isMidBoss(wave, last);
}

/** The mid-boss wave: the twin big jiangshi (a chapter shorter than it has none). */
export function isMidBoss(wave: number, last: number): boolean {
  return wave === WAVES.midBoss && wave < last;
}

/** Shrine waves open with the shrine cards (never the last wave). */
export function isShrineWave(wave: number, last: number): boolean {
  return wave >= SHRINE.first && (wave - SHRINE.first) % SHRINE.every === 0 && wave < last;
}

export function isEliteWave(wave: number, last: number): boolean {
  return wave % WAVES.eliteEvery === 0 && !isBossWave(wave, last);
}

/** Starts wave `wave`: the horde grows to its size, and its elite or boss arrives. */
export function beginWave(s: SimState, wave: number): void {
  const last = s.config.waves;
  const p = s.players[0];
  s.wave = wave;
  s.waveT = 0;
  // newcomers come from just outside the view, like respawns; every runnerEvery-th is a runner
  let swarm = 0;
  for (const m of s.mobs) if (m.kind === 'swarm') swarm++;
  for (let n = s.mobs.length - swarm; n < hordeSize(wave); n++) {
    const kind = wave >= MIX.runnerFrom && n % MIX.runnerEvery === MIX.runnerEvery - 1 ? 'runner' : 'chaser';
    const m = newMob(0, 0, mobHp(wave, kind), kind);
    ringPoint(s.ai, p.x, p.y, m);
    s.mobs.push(m);
  }
  // a swarm pack comes bunched from one side
  const pack = isSwarmWave(wave, last) ? Math.min(MIX.swarmPack, MIX.swarmMax - swarm) : 0;
  const at = body(0, 0);
  if (pack > 0) ringPoint(s.ai, p.x, p.y, at);
  for (let k = 0; k < pack; k++) {
    const r = MIX.swarmSpread;
    s.mobs.push(newMob(at.x + s.ai.range(-r, r), at.y + s.ai.range(-r, r), mobHp(wave, 'swarm'), 'swarm'));
  }
  if (isEliteWave(wave, last) && s.elites.length === 0) {
    const e = newElite(0, 0, s.nextId++);
    ringPoint(s.ai, p.x, p.y, e);
    s.elites.push(e);
  }
  if (isMidBoss(wave, last)) {
    // the twins come from opposite sides of the hero
    const a = newElite(0, 0, s.nextId++, WAVES.twinHp);
    ringPoint(s.ai, p.x, p.y, a);
    const b = newElite(2 * p.x - a.x, 2 * p.y - a.y, s.nextId++, WAVES.twinHp, ELITE.cooldown + WAVES.twinDelay);
    s.elites.push(a, b);
  } else if (isBossWave(wave, last) && !s.boss) {
    ringPoint(s.ai, p.x, p.y, at);
    s.boss = newBoss(at.x, at.y);
  }
}

export function waveSystem(s: SimState, events: SimEvent[]): void {
  const last = s.config.waves;
  if (last === 0 || s.outcome !== 'playing') return;
  if (s.players.every((p) => p.dead)) {
    s.outcome = 'lost';
    return;
  }
  s.waveT++;
  if (isMidBoss(s.wave, last) && s.elites.length > 0) return;
  if (s.wave === last) {
    if (s.boss && s.boss.phase !== 'down') return;
    s.outcome = 'won';
    for (const p of s.players) payBet(p);
    events.push({ type: 'cleared' });
    return;
  }
  if (s.waveT < WAVES.ticks) return;
  beginWave(s, s.wave + 1);
  events.push({ type: 'wave', wave: s.wave });
  if (isShrineWave(s.wave, last)) openShrine(s);
}
