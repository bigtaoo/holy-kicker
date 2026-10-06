import {
  BOSS, CARP, CHAPTER_BOSSES, DEMON, ELITE_PAIRS, EMPOWERED_JUDGE, DOOR_GOD, EMPOWERED_WITCH, JUDGE, CHAPTER_ELITES, CHAPTER_MOBS, CHAPTER_PACKS, ELITE, EMPOWERED, EMPOWERED_CARP, extraKind, HARD, HORDE, MOB_KINDS, SHRINE,
  rampChapter, tempKind, TOAD_KING, WAVES, WITCH, WOLF_LEADER, type BossKind, type EliteKind, type MobKind, type Pack,
} from '../config';
import type { SimEvent } from '../events';
import { body, newElite, newMob, underground, type SimState } from '../state';
import { newBoss } from './boss';
import { openShrine, payBet } from './build';
import { respawnPoint, ringPoint } from './horde';
import { resetMob } from './marsh';

// The chapter's waves (docs/design.md "Chapters"): each lasts WAVES.ticks; the horde grows
// at the start of every wave (the chapter's kinds joining it, CHAPTER_MOBS, and wisp or wolf
// packs on pack waves, CHAPTER_PACKS), the chapter's elite comes every fifth wave (the last of
// them brings the previous chapter's elite along), and the boss waves last until their boss
// falls: the mid-bosses (WAVES.midBosses) are two elites, the twin big jiangshi, in chapter 1
// and the previous chapter's boss empowered after it, and the last wave has the chapter boss
// (CHAPTER_BOSSES). Elites and mid-bosses grow tougher wave by wave (waveFoeHp). The chapter boss falling wins the run;
// every hero down loses it until a revive. Shrine waves open with the shrine cards. The
// sandbox (config.waves 0) skips all of this.

export function hordeSize(wave: number): number {
  return Math.min(WAVES.hordeMax, WAVES.hordeBase + WAVES.hordeStep * (wave - 1));
}

/**
 * Health of a mob of `kind` that joins or comes back on wave `wave` of chapter `chapter`; the
 * sandbox (wave 0) horde has 1.
 */
export function mobHp(wave: number, kind: MobKind = 'chaser', chapter = 1, hard = false): number {
  const n = wave - 1;
  const hp = wave > 0 ? HORDE.hp + Math.trunc((HORDE.hpStep * n + HORDE.hpSquare * n * n) / 1000) : 1;
  return Math.max(1, Math.trunc((hp * MOB_KINDS[kind].hpPercent * chapterHp(chapter, wave, hard)) / 10000));
}

/** Mob health percent of chapter `chapter` on wave `wave` (HORDE.chapterHp or HARD.hp, ramped in over the run). */
export function chapterHp(chapter: number, wave: number, hard = false): number {
  const table = hard ? HARD.hp : HORDE.chapterHp;
  return rampChapter(table[Math.min(Math.max(chapter, 1), table.length) - 1], wave);
}

/** Health `hp` of an elite or boss of chapter `chapter`: HARD.foeHp percent of it in hard mode. */
export function foeHp(hp: number, chapter: number, hard: boolean): number {
  return hard ? Math.trunc((hp * HARD.foeHp[Math.min(Math.max(chapter, 1), HARD.foeHp.length) - 1]) / 100) : hp;
}

/** The kind of the n-th mob (0-based) of the horde, joining on wave `wave` of chapter `chapter`. */
export function newcomer(chapter: number, wave: number, n: number): MobKind {
  const rules = CHAPTER_MOBS[Math.min(Math.max(chapter, 1), CHAPTER_MOBS.length) - 1];
  for (const r of rules) if (wave >= r.from && n % r.every === r.every - 1) return r.kind;
  return 'chaser';
}

/**
 * Health `hp` of an elite or mid-boss coming on wave `wave` (WAVES.foeHpPerWave percent per
 * wave off WAVES.foeHpWave), then the chapter's (foeHp).
 */
export function waveFoeHp(hp: number, chapter: number, wave: number, hard: boolean): number {
  return foeHp(Math.trunc((hp * (100 + WAVES.foeHpPerWave * (wave - WAVES.foeHpWave))) / 100), chapter, hard);
}

/** Health of each mid-boss twin on wave `wave`. */
export function twinHp(chapter: number, wave: number, hard: boolean): number {
  return waveFoeHp(WAVES.twinHp, chapter, wave, hard);
}

/** The elite of chapter `chapter` (CHAPTER_ELITES; before the first, none). */
export function chapterElite(chapter: number): EliteKind {
  return CHAPTER_ELITES[Math.min(Math.max(chapter, 1), CHAPTER_ELITES.length) - 1];
}

/** The boss of chapter `chapter` (CHAPTER_BOSSES). */
export function chapterBoss(chapter: number): BossKind {
  return CHAPTER_BOSSES[Math.min(Math.max(chapter, 1), CHAPTER_BOSSES.length) - 1];
}

/**
 * The elites coming on elite wave `wave`: the chapter's, and on the last one the previous
 * chapter's too; hard mode adds a second of the first.
 */
export function eliteKinds(chapter: number, wave: number, last: number, hard = false): EliteKind[] {
  let kinds: EliteKind[];
  // chapter 5 has none of its own: earlier ones, one on the first elite wave, then the pairs in turn (ELITE_PAIRS)
  const k = Math.trunc(wave / WAVES.eliteEvery) - 1;
  if (chapter >= 5) kinds = [...ELITE_PAIRS[k <= 0 ? 0 : 1 + ((k - 1) % (ELITE_PAIRS.length - 1))]];
  else {
    kinds = [chapterElite(chapter)];
    if (chapter > 1 && !isEliteWave(wave + WAVES.eliteEvery, last)) kinds.push(chapterElite(chapter - 1));
  }
  if (hard) kinds.push(kinds[0]);
  return kinds;
}

/** Chapter `chapter`'s packs (CHAPTER_PACKS). */
export function chapterPack(chapter: number): Pack {
  return CHAPTER_PACKS[Math.min(Math.max(chapter, 1), CHAPTER_PACKS.length) - 1];
}

/** Pack waves bring a pack of the chapter's pack mobs (never a boss wave). */
export function isPackWave(chapter: number, wave: number, last: number): boolean {
  const k = chapterPack(chapter);
  return wave >= k.from && (wave - k.from) % k.every === 0 && !isBossWave(wave, last);
}

/** The boss of kind `kind` with its health, empowered for a mid-boss. */
function bossOf(kind: BossKind, empowered: boolean): { hp: number } {
  if (kind === 'carp') return empowered ? EMPOWERED_CARP : CARP;
  if (kind === 'witch') return empowered ? EMPOWERED_WITCH : WITCH;
  if (kind === 'judge') return empowered ? EMPOWERED_JUDGE : JUDGE;
  if (kind === 'demon') return DEMON;
  return empowered ? EMPOWERED : BOSS;
}

function newEliteOf(s: SimState, kind: EliteKind) {
  const hp = (n: number) => waveFoeHp(n, s.config.chapter, s.wave, s.config.hard);
  if (kind === 'toadKing') return newElite(0, 0, s.nextId++, hp(TOAD_KING.hp), TOAD_KING.cooldown, kind);
  if (kind === 'wolfLeader') return newElite(0, 0, s.nextId++, hp(WOLF_LEADER.hp), ELITE.cooldown, kind);
  if (kind === 'doorGod') return newElite(0, 0, s.nextId++, hp(DOOR_GOD.hp), DOOR_GOD.cooldown, kind);
  return newElite(0, 0, s.nextId++, hp(ELITE.hp));
}

export function isBossWave(wave: number, last: number): boolean {
  return wave === last || isMidBoss(wave, last);
}

/** A mid-boss wave: the twins or the empowered abbot (a chapter shorter than it has none). */
export function isMidBoss(wave: number, last: number): boolean {
  return WAVES.midBosses.includes(wave) && wave < last;
}

/** The mid-boss (the twins or the empowered boss) or the chapter boss is standing. */
export function bossUp(s: SimState): boolean {
  const last = s.config.waves;
  if (!isBossWave(s.wave, last)) return false;
  return (s.boss !== null && s.boss.phase !== 'down') || (isMidBoss(s.wave, last) && s.elites.length > 0);
}

/** A boss stands and the standing horde is still above WAVES.bossHordePercent of the wave's. */
export function bossThins(s: SimState): boolean {
  if (!bossUp(s)) return false;
  let standing = 0;
  for (const m of s.mobs) if (!underground(m)) standing++;
  return standing * 100 > hordeSize(s.wave) * WAVES.bossHordePercent;
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
  // ground there, to rise next to the hero later); packs and summons are on top
  const k = chapterPack(s.config.chapter);
  let extra = 0;
  let packed = 0;
  for (const m of s.mobs) {
    if (extraKind(m.kind)) extra++;
    if (m.kind === k.kind) packed++;
    // the mobs that rested out the boss fight come back
    if (m.hp === 0 && !tempKind(m.kind)) {
      m.hp = mobHp(wave, m.kind, s.config.chapter, s.config.hard);
      resetMob(s, m);
      respawnPoint(s.ai, p, m);
    }
  }
  for (let n = s.mobs.length - extra; n < hordeSize(wave); n++) {
    const kind = newcomer(s.config.chapter, wave, n);
    const m = newMob(0, 0, mobHp(wave, kind, s.config.chapter, s.config.hard), kind);
    resetMob(s, m);
    respawnPoint(s.ai, p, m);
    s.mobs.push(m);
  }
  // a pack comes bunched from one side
  const pack = isPackWave(s.config.chapter, wave, last) ? Math.max(0, Math.min(k.size, k.max - packed)) : 0;
  const at = body(0, 0);
  if (pack > 0) respawnPoint(s.ai, p, at);
  for (let j = 0; j < pack; j++) {
    const r = k.spread;
    s.mobs.push(newMob(at.x + s.ai.range(-r, r), at.y + s.ai.range(-r, r), mobHp(wave, k.kind, s.config.chapter, s.config.hard), k.kind));
  }
  if (isEliteWave(wave, last) && s.elites.length === 0) {
    for (const kind of eliteKinds(s.config.chapter, wave, last, s.config.hard)) {
      const e = newEliteOf(s, kind);
      ringPoint(s.ai, p.x, p.y, e);
      s.elites.push(e);
    }
  }
  if (isMidBoss(wave, last) && s.config.chapter >= 2) {
    // the previous chapter's boss, empowered
    ringPoint(s.ai, p.x, p.y, at);
    const kind = chapterBoss(s.config.chapter - 1);
    s.boss = newBoss(at.x, at.y, waveFoeHp(bossOf(kind, true).hp, s.config.chapter, wave, s.config.hard), true, kind);
  } else if (isMidBoss(wave, last)) {
    // the twins come from opposite sides of the hero
    const hp = twinHp(s.config.chapter, wave, s.config.hard);
    const a = newElite(0, 0, s.nextId++, hp);
    ringPoint(s.ai, p.x, p.y, a);
    const b = newElite(2 * p.x - a.x, 2 * p.y - a.y, s.nextId++, hp, ELITE.cooldown + WAVES.twinDelay);
    s.elites.push(a, b);
  } else if (isBossWave(wave, last) && !s.boss) {
    ringPoint(s.ai, p.x, p.y, at);
    const kind = chapterBoss(s.config.chapter);
    s.boss = newBoss(at.x, at.y, foeHp(bossOf(kind, false).hp, s.config.chapter, s.config.hard), false, kind);
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
