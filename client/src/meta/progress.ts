import { BALANCE, type Chest } from './balance';
import { mergeCodex, type EvolveId } from './codex';
import { addDrops, grantRelics, rollDrops, type Drop } from './gear';
import type { SaveData } from './save';
import { trainingStats } from './training';
import { earnedSutras, newUnlocks, sutraBits, unlockedRelics, type Unlock } from './unlocks';
import type { FirstGift } from './welcome';

export { earnedSutras, unlockedRelics } from './unlocks';

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
  /** Enemies the run defeated, for the lifetime count (achievements.ts). */
  kills?: number;
  /** The hero went down and was revived. */
  revived?: boolean;
  /** The hero's lowest health over the run, percent (the engine's Player.lowest). */
  lowest?: number;
}

export interface ChestReward extends Chest {
  index: number;
}

export interface Reward {
  /** Copper for the waves cleared and the offerings, with training's bonus; the part a rewarded ad doubles. */
  copper: number;
  /** The offerings' share of `copper`. */
  offering: number;
  /** Progress chests this run reached for the first time, waiting in the lobby (progressChests.ts). */
  chests: ChestReward[];
  xp: number;
  levelsGained: number;
  /** The chapter was cleared for the first time (on the run's track). */
  firstClear: boolean;
  /** The run's stars (`runStars`), 0 for a lost run, and the chapter's best before it. */
  stars: number;
  bestStars: number;
  /** The run won the chapter's third star and so opened its hard mode. */
  hardUnlocked: boolean;
  /** The run was hard mode. */
  hard: boolean;
  /** What the run unlocked: relics, sutras, monks to buy, gear tiers, star blessings (unlocks.ts). */
  unlocks: Unlock[];
  /** Evolutions done for the first time, now in the Codex; none while the Codex tab is still locked (it opens all new). */
  newCodex: EvolveId[];
  /** No chapter was cleared before this run (it is the first clear or earlier): the results keep to the essentials. */
  newcomer: boolean;
  newBest: boolean;
  /** The chapter's best waves before this run (0 for a first try). */
  best: number;
  /** Gear the run dropped, already in the save. */
  drops: Drop[];
  /** The grit this lost run added (the new count), 0 if none. */
  grit: number;
  /** The wave of the chapter's next unclaimed progress chest, null with all of them claimed. */
  nextChest: number | null;
  /** A won run's time in tenths of a simulated second, and the chapter's best before it (0 for none), set after settling. */
  time?: { tenths: number; best: number } | null;
  /** The welcome gift the first run paid (welcome.ts afterRun), set after settling. */
  gift?: FirstGift | null;
}

/** Copper multiplier of a stage (`stage`): 1, 1.5, 2, ... */
export function chapterMul(stage: number): number {
  return 1 + BALANCE.copperChapterStep * (stage - 1);
}

/**
 * Where chapter `chapter` sits on the whole climb: its number on the normal track, BALANCE.hardStage
 * more in hard mode (a hard chapter is about as hard as the normal one that many chapters on).
 * Copper, chests and the gear tiers that drop grow along it.
 */
export function stage(chapter: number, hard = false): number {
  return hard ? chapter + BALANCE.hardStage : chapter;
}

/**
 * A run's stars (docs/design.md "Stars"): one for the clear, two without going down, three with
 * the health never under BALANCE.stars.lowest percent; none for a lost run.
 */
export function runStars(won: boolean, revived: boolean, lowest: number): number {
  if (!won) return 0;
  if (revived) return 1;
  return lowest >= BALANCE.stars.lowest ? 3 : 2;
}

/** Whether chapter `chapter` is cleared on the given track. */
export function isCleared(save: SaveData, chapter: number, hard = false): boolean {
  return hard ? (save.hardBest[chapter - 1] ?? 0) >= BALANCE.waves : save.cleared >= chapter;
}

/** A chapter's hard mode opens with three stars on its normal mode. */
export function hardOpenAt(save: SaveData, chapter: number): boolean {
  return (save.stars[chapter - 1] ?? 0) >= 3;
}

/** Hard chapters cleared, in any order. */
export function hardClears(save: SaveData): number {
  return save.hardBest.filter((b) => b >= BALANCE.waves).length;
}

/** What progress chest `index` holds at stage `at` (`stage`): its wave, copper grown along the climb, jade. */
export function chestPay(at: number, index: number): Chest {
  const c = BALANCE.chests[index];
  return { wave: c.wave, copper: Math.round(c.copper * chapterMul(at)), jade: c.jade };
}

/** One track's progress per chapter: best waves, claimed chests and stars, normal or hard. */
export function track(save: SaveData, hard: boolean): { best: number[]; chests: number[]; stars: number[] } {
  return hard
    ? { best: save.hardBest, chests: save.hardChests, stars: save.hardStars }
    : { best: save.best, chests: save.chests, stars: save.stars };
}

/** The first uncleared chapter (where grit gathers), or null with every chapter cleared. */
export function frontier(save: SaveData): number | null {
  return save.cleared < BALANCE.chapters ? save.cleared + 1 : null;
}

/** Whether chapter `chapter` of the given track is the frontier (hard mode never is). */
export function atFrontier(save: SaveData, chapter: number, hard: boolean): boolean {
  return !hard && frontier(save) === chapter;
}

export function copperPerWave(chapter: number): number {
  return Math.round(BALANCE.copperPerWave * chapterMul(chapter));
}

export function xpToNext(level: number): number {
  return BALANCE.levelXpBase + BALANCE.levelXpStep * (level - 1);
}

/** Pays the run into the save: copper, xp, best wave, chapter clear; the chests it reached wait in the lobby. */
export function settleRun(save: SaveData, run: RunResult, rand: () => number = Math.random): { save: SaveData; reward: Reward } {
  const i = run.chapter - 1;
  const hard = run.hard === true;
  const was = track(save, hard);
  const waves = Math.max(0, Math.min(BALANCE.waves, Math.floor(run.waves)));
  const at = stage(run.chapter, hard);
  const chests: ChestReward[] = [];
  let claimed = was.chests[i];
  BALANCE.chests.forEach((c, index) => {
    const bit = 1 << index;
    if (waves >= c.wave && !(claimed & bit)) {
      claimed |= bit;
      chests.push({ index, ...chestPay(at, index) });
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
  const firstClear = won && !isCleared(save, run.chapter, hard);
  const cleared = !hard && firstClear ? run.chapter : save.cleared;
  const stars = runStars(won, run.revived === true, run.lowest ?? 0);
  const bestStars = was.stars[i] ?? 0;
  const hardUnlocked = !hard && bestStars < 3 && stars >= 3;
  const relics = unlockedRelics({ ...save, cleared });
  const drops = rollDrops(at, waves, relics, !save.firstRunDone, rand);
  // a real try on the first uncleared chapter that fell short gives grit for the next ones
  const tried = !won && atFrontier(save, run.chapter, hard) && waves >= BALANCE.grit.minWaves && save.grit < BALANCE.grit.max;
  const grit = firstClear && !hard ? 0 : tried ? save.grit + 1 : save.grit;
  const best = was.best.map((b, k) => (k === i ? Math.max(b, waves) : b));
  const claimedAll = was.chests.map((c, k) => (k === i ? claimed : c));
  const starsAll = was.stars.map((v, k) => (k === i ? Math.max(v, stars) : v));
  const next: SaveData = {
    ...save,
    firstRunDone: true,
    level,
    xp,
    copper: save.copper + copper,
    // a first clear on the normal track moves the lobby on to the chapter it just unlocked
    chapter: !hard && firstClear ? Math.min(BALANCE.chapters, run.chapter + 1) : save.chapter,
    hard: !hard && firstClear ? false : save.hard,
    cleared,
    best: hard ? save.best : best,
    chests: hard ? save.chests : claimedAll,
    stars: hard ? save.stars : starsAll,
    hardBest: hard ? best : save.hardBest,
    hardChests: hard ? claimedAll : save.hardChests,
    hardStars: hard ? starsAll : save.hardStars,
    runs: save.runs + 1,
    kills: save.kills + Math.max(0, Math.floor(run.kills ?? 0)),
    codex: mergeCodex(save.codex, run.evolved),
    gear: grantRelics(addDrops(save.gear, drops), relics),
    grit,
  };
  next.sutras = sutraBits(earnedSutras(next));
  const reward = {
    copper, offering, chests, xp: waves * BALANCE.xpPerWave, levelsGained: level - save.level,
    firstClear, stars, bestStars, hardUnlocked, hard, unlocks: newUnlocks(save, next),
    newCodex: tabLock(next, 'codex') ? [] : next.codex.filter((id) => !save.codex.includes(id)),
    newcomer: save.cleared === 0,
    newBest: waves > was.best[i],
    best: was.best[i],
    drops,
    grit: tried ? grit : 0,
    nextChest: BALANCE.chests.find((_, k) => !(claimed & (1 << k)))?.wave ?? null,
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
    case 'shop':
      return null;
    case 'gear':
      return save.firstRunDone ? null : { kind: 'firstRun' };
    case 'train':
      if (!save.firstRunDone) return { kind: 'firstRun' };
      return save.level >= u.trainLevel ? null : { kind: 'level', level: u.trainLevel };
    case 'codex':
      return save.cleared >= u.codexChapter ? null : { kind: 'chapter', n: u.codexChapter };
  }
}

/** The tab is open but the player has never looked at it (Play is always seen). */
export function tabNew(save: SaveData, tab: Tab): boolean {
  return tab !== 'play' && !tabLock(save, tab) && !(save.seen & (1 << TABS.indexOf(tab)));
}

export function seeTab(save: SaveData, tab: Tab): SaveData {
  const bit = 1 << TABS.indexOf(tab);
  return save.seen & bit ? save : { ...save, seen: save.seen | bit };
}

/** The highest cleared stage (`stage`, a hard clear counting on), at least 1: what patrol and the shop pay by. */
export function bestChapter(save: SaveData): number {
  let best = Math.max(1, save.cleared);
  save.hardBest.forEach((b, i) => {
    if (b >= BALANCE.waves) best = Math.max(best, stage(i + 1, true));
  });
  return best;
}

/** Chapters the player may start: every cleared one and the first uncleared one (hard mode where open). */
export function playableChapters(save: SaveData): number {
  return Math.min(BALANCE.chapters, save.cleared + 1);
}

/** The lobby's card switches the shown chapter between its normal and hard mode. */
export function chooseTrack(save: SaveData, hard: boolean): SaveData {
  if (hard && !hardOpenAt(save, save.chapter)) return save;
  return { ...save, hard };
}

/** The lobby's card shows another chapter, in hard mode only where that is open. */
export function selectChapter(save: SaveData, chapter: number): SaveData {
  if (chapter < 1 || chapter > playableChapters(save)) return save;
  return { ...save, chapter, hard: save.hard && hardOpenAt(save, chapter) };
}
