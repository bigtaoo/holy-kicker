import { CHAPTER_ELITES, CHAPTER_MOBS, ELITE, EMPOWERED, HORDE, MIX, MOB_KINDS, SHRINE, TOAD_KING, WAVES, type EliteKind, type MobKind } from '../config';
import type { SimEvent } from '../events';
import { body, newElite, newMob, type SimState } from '../state';
import { newBoss } from './boss';
import { openShrine, payBet } from './build';
import { ringPoint } from './horde';
import { resetMob } from './marsh';

// The chapter's waves (docs/design.md "Chapters"): each lasts WAVES.ticks; the horde grows
// at the start of every wave (the chapter's kinds joining it, CHAPTER_MOBS, and swarm packs
// on swarm waves), the chapter's elite comes every tenth wave (the last of them brings the
// previous chapter's elite along), and the boss waves last until their boss falls:
// the mid-boss is two elites, the twin big jiangshi, in chapter 1 and the empowered Fallen
// Abbot after it, and the last wave has the chapter boss. The chapter boss falling wins the run;
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

/** The kind of the n-th mob (0-based) of the horde, joining on wave `wave` of chapter `chapter`. */
export function newcomer(chapter: number, wave: number, n: number): MobKind {
  const rules = CHAPTER_MOBS[Math.min(Math.max(chapter, 1), CHAPTER_MOBS.length) - 1];
  for (const r of rules) if (wave >= r.from && n % r.every === r.every - 1) return r.kind;
  return 'chaser';
}

/** The elite of chapter `chapter` (CHAPTER_ELITES; before the first, none). */
export function chapterElite(chapter: number): EliteKind {
  return CHAPTER_ELITES[Math.min(Math.max(chapter, 1), CHAPTER_ELITES.length) - 1];
}

/** The elites coming on elite wave `wave`: the chapter's, and on the last one the previous chapter's too. */
export function eliteKinds(chapter: number, wave: number, last: number): EliteKind[] {
  const kinds = [chapterElite(chapter)];
  if (chapter > 1 && !isEliteWave(wave + WAVES.eliteEvery, last)) kinds.push(chapterElite(chapter - 1));
  return kinds;
}

/** Swarm waves bring a pack of swarm mobs (never a boss wave). */
export function isSwarmWave(wave: number, last: number): boolean {
  return wave >= MIX.swarmFrom && (wave - MIX.swarmFrom) % MIX.swarmEvery === 0 && !isBossWave(wave, last);
}

export function isBossWave(wave: number, last: number): boolean {
  return wave === last || isMidBoss(wave, last);
}

/** The mid-boss wave: the twins or the empowered abbot (a chapter shorter than it has none). */
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
  // newcomers come from just outside the view, like respawns (an emerger waits under the
  // ground there, to rise next to the hero later)
  let swarm = 0;
  for (const m of s.mobs) if (m.kind === 'swarm') swarm++;
  for (let n = s.mobs.length - swarm; n < hordeSize(wave); n++) {
    const kind = newcomer(s.config.chapter, wave, n);
    const m = newMob(0, 0, mobHp(wave, kind), kind);
    resetMob(s, m);
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
    for (const kind of eliteKinds(s.config.chapter, wave, last)) {
      const e = kind === 'toadKing' ? newElite(0, 0, s.nextId++, TOAD_KING.hp, TOAD_KING.cooldown, kind) : newElite(0, 0, s.nextId++);
      ringPoint(s.ai, p.x, p.y, e);
      s.elites.push(e);
    }
  }
  if (isMidBoss(wave, last) && s.config.chapter >= 2) {
    ringPoint(s.ai, p.x, p.y, at);
    s.boss = newBoss(at.x, at.y, EMPOWERED.hp, true);
  } else if (isMidBoss(wave, last)) {
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
  if (isMidBoss(s.wave, last) && (s.elites.length > 0 || (s.boss && s.boss.phase !== 'down'))) return;
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
