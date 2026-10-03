import { RELIC_IDS, SUTRA_IDS, type RelicId, type SutraId } from '@hk/engine';
import { BALANCE, type Chest, type SutraGoal } from './balance';
import { mergeCodex, type EvolveId } from './codex';
import type { SaveData } from './save';

// What a finished run pays and unlocks. Pure: takes a save, returns a new one.

export interface RunResult {
  chapter: number;
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
  /** Copper for the waves cleared and the offerings; the part a rewarded ad doubles. */
  copper: number;
  /** The offerings' share of `copper`. */
  offering: number;
  /** Progress chests opened for the first time by this run. */
  chests: ChestReward[];
  xp: number;
  levelsGained: number;
  /** The chapter was cleared for the first time. */
  firstClear: boolean;
  /** The relic that first clear unlocked, if any. */
  newRelic: RelicId | null;
  /** Evolutions done for the first time, now in the Codex. */
  newCodex: EvolveId[];
  /** Sutras this run earned. */
  newSutras: SutraId[];
  newBest: boolean;
}

/** Chapter multiplier for copper: 1, 1.5, 2, ... */
function chapterMul(chapter: number): number {
  return 1 + BALANCE.copperChapterStep * (chapter - 1);
}

export function copperPerWave(chapter: number): number {
  return Math.round(BALANCE.copperPerWave * chapterMul(chapter));
}

export function xpToNext(level: number): number {
  return BALANCE.levelXpBase + BALANCE.levelXpStep * (level - 1);
}

/** Pays the run into the save: copper, unclaimed chests, xp, best wave, chapter clear. */
export function settleRun(save: SaveData, run: RunResult): { save: SaveData; reward: Reward } {
  const i = run.chapter - 1;
  const waves = Math.max(0, Math.min(BALANCE.waves, Math.floor(run.waves)));
  const mul = chapterMul(run.chapter);
  const chests: ChestReward[] = [];
  let claimed = save.chests[i];
  BALANCE.chests.forEach((c, index) => {
    const bit = 1 << index;
    if (waves >= c.wave && !(claimed & bit)) {
      claimed |= bit;
      chests.push({ index, wave: c.wave, copper: Math.round(c.copper * mul), jade: c.jade });
    }
  });
  const base = waves * copperPerWave(run.chapter);
  const offering = Math.round((base * BALANCE.offeringPercent * (run.offerings ?? 0)) / 100);
  const copper = base + offering;

  let level = save.level;
  let xp = save.xp + waves * BALANCE.xpPerWave;
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
  }

  const won = waves >= BALANCE.waves;
  const firstClear = won && save.cleared < run.chapter;
  const cleared = firstClear ? run.chapter : save.cleared;
  const next: SaveData = {
    ...save,
    firstRunDone: true,
    level,
    xp,
    copper: save.copper + copper + chests.reduce((n, c) => n + c.copper, 0),
    jade: save.jade + chests.reduce((n, c) => n + c.jade, 0),
    // a first clear moves the lobby on to the chapter it just unlocked
    chapter: firstClear ? Math.min(BALANCE.chapters, run.chapter + 1) : save.chapter,
    cleared,
    best: save.best.map((b, k) => (k === i ? Math.max(b, waves) : b)),
    chests: save.chests.map((c, k) => (k === i ? claimed : c)),
    runs: save.runs + 1,
    codex: mergeCodex(save.codex, run.evolved),
  };
  const reward = {
    copper, offering, chests, xp: waves * BALANCE.xpPerWave, levelsGained: level - save.level,
    firstClear, newRelic: firstClear ? (unlockedRelics(next).find((r) => !unlockedRelics(save).includes(r)) ?? null) : null,
    newCodex: next.codex.filter((id) => !save.codex.includes(id)),
    newSutras: earnedSutras(next).filter((id) => !earnedSutras(save).includes(id)),
    newBest: waves > save.best[i],
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

/** Chapters the player may start: every cleared one and the first uncleared one. */
export function playableChapters(save: SaveData): number {
  return Math.min(BALANCE.chapters, save.cleared + 1);
}
