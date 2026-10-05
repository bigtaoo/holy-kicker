import { RELIC_IDS, SUTRA_IDS, type RelicId, type SutraId } from '@hk/engine';
import { BALANCE, type Chest, type SutraGoal } from './balance';
import { mergeCodex, type EvolveId } from './codex';
import { addDrops, grantRelics, rollDrops, type Drop } from './gear';
import type { SaveData } from './save';
import { trainingStats } from './training';

// What a finished run pays and unlocks. Pure: takes a save (and, for the gear drops, a random
// source giving [0, 1)), returns a new one.

export interface RunResult {
  chapter: number;
  /** A hard mode run (docs/design.md "Hard mode"). */
  hard?: boolean;
  /** Waves fully cleared, 0..BALANCE.waves. */
  waves: number;
  /** Shrine offerings won in the run. */
  offerings?: number;
  /** What the run evolved or awakened (codex.ts evolvedIn). */
  evolved?: EvolveId[];
}

export interface ChestReward extends Chest {
  index: number;
}

export interface Reward {
  /** Copper for the waves cleared and the offerings, with training's bonus; the part a rewarded ad doubles. */
  copper: number;
  /** The offerings' share of `copper`. */
  offering: number;
  /** Progress chests opened for the first time by this run. */
  chests: ChestReward[];
  xp: number;
  levelsGained: number;
  /** The chapter was cleared for the first time (on the run's track). */
  firstClear: boolean;
  /** That first clear opened hard mode. */
  hardUnlocked: boolean;
  /** The run was hard mode. */
  hard: boolean;
  /** The relic that first clear unlocked, if any. */
  newRelic: RelicId | null;
  /** Evolutions done for the first time, now in the Codex. */
  newCodex: EvolveId[];
  /** Sutras this run earned. */
  newSutras: SutraId[];
  newBest: boolean;
  /** Gear the run dropped, already in the save. */
  drops: Drop[];
  /** The grit this lost run added (the new count), 0 if none. */
  grit: number;
}

/** Copper multiplier of a stage (`stage`): 1, 1.5, 2, ... */
export function chapterMul(stage: number): number {
  return 1 + BALANCE.copperChapterStep * (stage - 1);
}

/**
 * Where chapter `chapter` sits on the whole climb: 1..5 on the normal track, 6..10 in hard
 * mode. Copper, chests and the gear tiers that drop grow along it.
 */
export function stage(chapter: number, hard = false): number {
  return hard ? BALANCE.chapters + chapter : chapter;
}

/** Hard mode opens once every chapter is cleared. */
export function hardOpen(save: SaveData): boolean {
  return save.cleared >= BALANCE.chapters;
}

/** One track's progress: clears, best waves and claimed chests, normal or hard. */
export function track(save: SaveData, hard: boolean): { cleared: number; best: number[]; chests: number[] } {
  return hard
    ? { cleared: save.hardCleared, best: save.hardBest, chests: save.hardChests }
    : { cleared: save.cleared, best: save.best, chests: save.chests };
}

/** The first uncleared chapter of the climb (where grit gathers), or null with everything cleared. */
export function frontier(save: SaveData): { chapter: number; hard: boolean } | null {
  if (!hardOpen(save)) return { chapter: save.cleared + 1, hard: false };
  return save.hardCleared < BALANCE.chapters ? { chapter: save.hardCleared + 1, hard: true } : null;
}

/** Whether chapter `chapter` of the given track is the frontier. */
export function atFrontier(save: SaveData, chapter: number, hard: boolean): boolean {
  const f = frontier(save);
  return f !== null && f.chapter === chapter && f.hard === hard;
}

export function copperPerWave(chapter: number): number {
  return Math.round(BALANCE.copperPerWave * chapterMul(chapter));
}

export function xpToNext(level: number): number {
  return BALANCE.levelXpBase + BALANCE.levelXpStep * (level - 1);
}

/** Pays the run into the save: copper, unclaimed chests, xp, best wave, chapter clear. */
export function settleRun(save: SaveData, run: RunResult, rand: () => number = Math.random): { save: SaveData; reward: Reward } {
  const i = run.chapter - 1;
  const hard = run.hard === true;
  const was = track(save, hard);
  const waves = Math.max(0, Math.min(BALANCE.waves, Math.floor(run.waves)));
  const at = stage(run.chapter, hard);
  const mul = chapterMul(at);
  const chests: ChestReward[] = [];
  let claimed = was.chests[i];
  BALANCE.chests.forEach((c, index) => {
    const bit = 1 << index;
    if (waves >= c.wave && !(claimed & bit)) {
      claimed |= bit;
      chests.push({ index, wave: c.wave, copper: Math.round(c.copper * mul), jade: c.jade });
    }
  });
  const base = waves * copperPerWave(at);
  const more = 100 + (trainingStats(save).copper ?? 0);
  const offering = Math.round((base * BALANCE.offeringPercent * (run.offerings ?? 0) * more) / 10000);
  const copper = Math.round((base * more) / 100) + offering;

  let level = save.level;
  let xp = save.xp + waves * BALANCE.xpPerWave;
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
  }

  const won = waves >= BALANCE.waves;
  const firstClear = won && was.cleared < run.chapter;
  const cleared = !hard && firstClear ? run.chapter : save.cleared;
  const hardCleared = hard && firstClear ? run.chapter : save.hardCleared;
  const hardUnlocked = !hardOpen(save) && cleared >= BALANCE.chapters;
  const relics = RELIC_IDS.slice(0, cleared + 1);
  const drops = rollDrops(at, waves, relics, !save.firstRunDone, rand);
  // a real try on the first uncleared chapter that fell short gives grit for the next ones
  const tried = !won && atFrontier(save, run.chapter, hard) && waves >= BALANCE.grit.minWaves && save.grit < BALANCE.grit.max;
  const grit = firstClear ? 0 : tried ? save.grit + 1 : save.grit;
  const best = was.best.map((b, k) => (k === i ? Math.max(b, waves) : b));
  const claimedAll = was.chests.map((c, k) => (k === i ? claimed : c));
  const next: SaveData = {
    ...save,
    firstRunDone: true,
    level,
    xp,
    copper: save.copper + copper + chests.reduce((n, c) => n + c.copper, 0),
    jade: save.jade + chests.reduce((n, c) => n + c.jade, 0),
    // a first clear moves the lobby on to the chapter it just unlocked, the last one to hard mode
    chapter: hardUnlocked ? 1 : firstClear ? Math.min(BALANCE.chapters, run.chapter + 1) : save.chapter,
    hard: hardUnlocked || save.hard,
    cleared,
    hardCleared,
    best: hard ? save.best : best,
    chests: hard ? save.chests : claimedAll,
    hardBest: hard ? best : save.hardBest,
    hardChests: hard ? claimedAll : save.hardChests,
    runs: save.runs + 1,
    codex: mergeCodex(save.codex, run.evolved),
    gear: grantRelics(addDrops(save.gear, drops), relics),
    grit,
  };
  const reward = {
    copper, offering, chests, xp: waves * BALANCE.xpPerWave, levelsGained: level - save.level,
    firstClear, hardUnlocked, hard, newRelic: firstClear ? (unlockedRelics(next).find((r) => !unlockedRelics(save).includes(r)) ?? null) : null,
    newCodex: next.codex.filter((id) => !save.codex.includes(id)),
    newSutras: earnedSutras(next).filter((id) => !earnedSutras(save).includes(id)),
    newBest: waves > was.best[i],
    drops,
    grit: tried ? grit : 0,
  };
  return { save: next, reward };
}

/** The rewarded ad on the results screen pays the run's copper a second time. */
export function doubleCopper(save: SaveData, reward: Reward): SaveData {
  return { ...save, copper: save.copper + reward.copper };
}

export type Tab = 'shop' | 'gear' | 'play' | 'train' | 'codex';
export const TABS: readonly Tab[] = ['shop', 'gear', 'play', 'train', 'codex'];

export type Lock = { kind: 'firstRun' } | { kind: 'level'; level: number } | { kind: 'chapter'; n: number };

/** What still keeps a lobby tab closed, or null when it is open (docs/design.md "Flow"). */
export function tabLock(save: SaveData, tab: Tab): Lock | null {
  const u = BALANCE.unlocks;
  switch (tab) {
    case 'play':
      return null;
    case 'gear':
      return save.firstRunDone ? null : { kind: 'firstRun' };
    case 'train':
      return save.level >= u.trainLevel ? null : { kind: 'level', level: u.trainLevel };
    case 'shop':
      return save.cleared >= u.shopChapter ? null : { kind: 'chapter', n: u.shopChapter };
    case 'codex':
      return save.cleared >= u.codexChapter ? null : { kind: 'chapter', n: u.codexChapter };
  }
}

/** Relics the player may take into a run: the cuju, then one more per chapter cleared. */
/** The tab is open but the player has never looked at it (Play is always seen). */
export function tabNew(save: SaveData, tab: Tab): boolean {
  return tab !== 'play' && !tabLock(save, tab) && !(save.seen & (1 << TABS.indexOf(tab)));
}

export function seeTab(save: SaveData, tab: Tab): SaveData {
  const bit = 1 << TABS.indexOf(tab);
  return save.seen & bit ? save : { ...save, seen: save.seen | bit };
}

export function unlockedRelics(save: SaveData): RelicId[] {
  return RELIC_IDS.slice(0, save.cleared + 1);
}

/** The achievement that grants a sutra. */
export function sutraGoal(id: SutraId): SutraGoal {
  return BALANCE.sutras[SUTRA_IDS.indexOf(id)];
}

/** Whether the save has reached a sutra's goal. */
function reached(save: SaveData, goal: SutraGoal): boolean {
  if (goal.kind === 'wave') return save.best.some((b) => b >= goal.n);
  if (goal.kind === 'codex') return save.codex.length >= goal.n;
  if (goal.kind === 'runs') return save.runs >= goal.n;
  return save.cleared >= goal.n;
}

/**
 * Sutras the player has earned (docs/design.md "Content line"): each adds a spell or a passive
 * to the run's level-up pool. Read from the progress the save already keeps, so nothing new is
 * stored and an earned sutra is never lost.
 */
export function earnedSutras(save: SaveData): SutraId[] {
  return SUTRA_IDS.filter((id) => reached(save, sutraGoal(id)));
}

/** The highest cleared stage (`stage`, hard mode counting on), at least 1: what patrol and the shop pay by. */
export function bestChapter(save: SaveData): number {
  return Math.max(1, save.cleared + save.hardCleared);
}

/** Chapters the player may start on a track: every cleared one and the first uncleared one. */
export function playableChapters(save: SaveData, hard = save.hard): number {
  return Math.min(BALANCE.chapters, track(save, hard).cleared + 1);
}

/** The lobby switches to the other track, on its first uncleared chapter. */
export function chooseTrack(save: SaveData, hard: boolean): SaveData {
  if (hard && !hardOpen(save)) return save;
  return { ...save, hard, chapter: playableChapters(save, hard) };
}
