import { MONK_IDS, SUTRA_IDS, type MonkId, type RelicId } from '@hk/engine';
import { CHALLENGE_ID, EXP_NAME, isDice } from '@hk/protocol';
import { BALANCE } from './balance';
import { mergeCodex, type EvolveId } from './codex';
import { newDaily, parseDaily, type Daily } from './daily';
import { parseWeeks, type WeekEntry } from './weekly';
import { emptyInventory, grantRelics, ITEM_IDS, TIERS, type Inventory } from './gear';
import { keepUnlocks } from './unlocks';

// The player's progress (docs/design.md "Save contents"). Plain JSON, versioned; parseSave
// turns whatever a store hands back (nothing, garbage, an older version) into a valid save.
// Settings such as the language are not part of it: they stay on the device (settings.ts).

export const SAVE_VERSION = 7;
/** Bits per word of `achieved`: 30 keeps every word a small positive integer. */
export const ACHIEVED_BITS = 30;
/** Chapters a save before version 6 had; clearing them all opened hard mode on every one. */
const OLD_CHAPTERS = 5;

export interface SaveData {
  version: number;
  /** False until the first run ends; the first launch goes straight into chapter 1. */
  firstRunDone: boolean;
  level: number;
  /** Experience towards the next level. */
  xp: number;
  copper: number;
  jade: number;
  /** The chapter the lobby shows (1-based). */
  chapter: number;
  /** Highest cleared chapter, 0 for none. */
  cleared: number;
  /** Best waves cleared per chapter, index 0 is chapter 1. */
  best: number[];
  /** Best stars per chapter, 0..3 (progress.ts runStars); three open the chapter's hard mode. */
  stars: number[];
  /** Progress chests reached per chapter, one bit per chest in BALANCE.chests order. */
  chests: number[];
  /** The reached chests already opened in the lobby, the same bits (progressChests.ts). */
  opened: number[];
  runs: number;
  /** The relic chosen for the next run (docs/content.md "Relics", unlocked by chapter: unlocks.ts). */
  relic: RelicId;
  /** Evolutions and awakenings done at least once, in Codex order (codex.ts). */
  codex: EvolveId[];
  /** Owned gear, counts per item and tier (gear.ts); unlocked relics have at least one copy. */
  gear: Inventory;
  /** Sutras earned, bit i for SUTRA_IDS[i] (unlocks.ts earnedSutras), kept so a moved goal takes none away. */
  sutras: number;
  /** Training nodes bought, in line order (training.ts). */
  trained: number;
  /** When the patrol started piling up (ms since the epoch), 0 before it opens (patrol.ts). */
  patrol: number;
  /** Today's tasks, chests and quick patrols (daily.ts). */
  daily: Daily;
  /** Lobby tabs opened at least once, bit i for TABS[i] (progress.ts): an open tab not yet seen gets a dot. */
  seen: number;
  /** Lost tries on the first uncleared chapter, each worth BALANCE.grit.bonus there (loadout.ts). */
  grit: number;
  /** The lobby shows `chapter` in hard mode (open with its three stars). */
  hard: boolean;
  /** Hard mode's own best waves, stars and chests per chapter, as `best`, `stars`, `chests` and `opened`; a best of BALANCE.waves is a clear. */
  hardBest: number[];
  hardStars: number[];
  hardChests: number[];
  hardOpened: number[];
  /** The wave the last lost run fell on per chapter, 0 for none (falls.ts), and hard mode's. */
  fell: number[];
  hardFell: number[];
  /** The fastest won run per chapter in tenths of a simulated second, 0 for none (clearTimes.ts), and hard mode's. */
  times: number[];
  hardTimes: number[];
  /** The monk played as (monks.ts), and the monks owned, bit i for MONK_IDS[i] (the kicker always). */
  monk: MonkId;
  monks: number;
  /** Enemies defeated over every run, for the achievements (achievements.ts). */
  kills: number;
  /** Claimed achievements, bit i % 30 of word i / 30 for BALANCE.achievements[i] (achievements.ts). */
  achieved: number[];
  /** The dice name on the boards (protocol.ts packDice), 0 until the first launch rolls one (ui/playerName.ts). */
  dice: number;
  /** Welcome gifts claimed (welcome.ts), and the local date (yyyymmdd) of the last one. */
  gifts: number;
  giftDay: number;
  /** The local date (yyyymmdd) the first run ended, 0 before; that day's tasks ask less (daily.ts). */
  firstDay: number;
  /** The challenge whose counted run is done (challenge.ts), '' for none: later runs of it are practice. */
  challenge: string;
  /** Weeks with a finished weekly run, until paid once their ranks are final (weekly.ts). */
  weeks: WeekEntry[];
  /** The daily challenge's streak (challenge.ts): its length, the UTC day number of its last counted run, and the longest one. */
  streak: number;
  streakDay: number;
  bestStreak: number;
  /** The best waves of a daily's runs, counted or practice, and which daily ('' for none): offline it has no board, so this is the score. */
  dailyBest: { id: string; waves: number };
  /** The experiments this save was offered (experiments.ts): id → arm, '' when it was not enrolled (an older player). */
  arms: Record<string, string>;
  /** The player marked this device as a tester (settings): its events stay out of the dashboard's numbers. */
  tester: boolean;
}

export function newSave(): SaveData {
  const zeros = () => new Array<number>(BALANCE.chapters).fill(0);
  return {
    version: SAVE_VERSION, firstRunDone: false, level: 1, xp: 0, copper: 0, jade: 0,
    chapter: 1, cleared: 0, best: zeros(), stars: zeros(), chests: zeros(), opened: zeros(), runs: 0, relic: 'ball', codex: [],
    gear: grantRelics(emptyInventory(), ['ball']), sutras: 0, trained: 0, patrol: 0, daily: newDaily(), seen: 0, grit: 0,
    hard: false, hardBest: zeros(), hardStars: zeros(), hardChests: zeros(), hardOpened: zeros(), fell: zeros(), hardFell: zeros(), times: zeros(), hardTimes: zeros(), monk: 'kicker', monks: 1,
    kills: 0, achieved: [], dice: 0, gifts: 0, giftDay: 0, firstDay: 0, challenge: '', weeks: [], streak: 0, streakDay: 0, bestStreak: 0, dailyBest: { id: '', waves: 0 },
    arms: {}, tester: false,
  };
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
}

function ints(v: unknown, min: number, max: number): number[] {
  const out = new Array<number>(BALANCE.chapters).fill(0);
  if (Array.isArray(v)) for (let i = 0; i < out.length; i++) out[i] = int(v[i], min, max, 0);
  return out;
}

/** The low `width` bits of a bit field: a newer build's extra bits are dropped, not read as all set. */
function bits(v: unknown, width: number, fallback: number): number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v % 2 ** width : fallback;
}

/** Bit fields per chapter, as `ints`. */
function bitsPer(v: unknown, width: number): number[] {
  const out = new Array<number>(BALANCE.chapters).fill(0);
  if (Array.isArray(v)) for (let i = 0; i < out.length; i++) out[i] = bits(v[i], width, 0);
  return out;
}

/** The opened chests, within the reached ones; a save from before opening in the lobby was paid every chest it reached. */
function openedOf(v: unknown, reached: number[]): number[] {
  if (!Array.isArray(v)) return [...reached];
  return bitsPer(v, BALANCE.chests.length).map((o, i) => o & reached[i]);
}

function inventory(v: unknown): Inventory {
  const out = emptyInventory();
  if (v === null || typeof v !== 'object') return out;
  const raw = v as Record<string, unknown>;
  for (const id of ITEM_IDS) {
    const counts = raw[id];
    if (Array.isArray(counts)) for (let t = 0; t < TIERS; t++) out[id][t] = int(counts[t], 0, Number.MAX_SAFE_INTEGER, 0);
  }
  return out;
}

/** The claimed achievements: words of ACHIEVED_BITS bits, a newer build's goals cut off; before version 7 it was one number. */
function achievedOf(v: unknown): number[] {
  const words = typeof v === 'number' ? [v] : Array.isArray(v) ? v : [];
  const goals = BALANCE.achievements.length;
  const out: number[] = [];
  for (let w = 0; w * ACHIEVED_BITS < goals; w++) {
    out.push(bits(words[w], Math.min(ACHIEVED_BITS, goals - w * ACHIEVED_BITS), 0));
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

function dailyBestOf(v: unknown): { id: string; waves: number } {
  const raw = (v !== null && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return typeof raw.id === 'string' && CHALLENGE_ID.test(raw.id) ? { id: raw.id, waves: int(raw.waves, 0, BALANCE.waves, 0) } : { id: '', waves: 0 };
}

/** Whether `id` names a monk in the `monks` bits. */
function owned(monks: number, id: unknown): boolean {
  const i = MONK_IDS.indexOf(id as MonkId);
  return i >= 0 && (monks & (1 << i)) !== 0;
}

/**
 * A valid save from stored text. Missing or broken text gives a new save; every field is
 * checked on its own, so one bad value does not throw away the rest of the progress.
 * Version 1 had no gear or training: it reads as none, and its unlocked relics get their copy.
 * Version 2 had no patrol or daily counters: the patrol starts in the lobby, the day afresh.
 * Version 3 had no achievements: the kills start at 0, and what the progress already reached
 * waits to be claimed.
 * Version 4 had no welcome gifts: a player past the first run gets them from the next lobby.
 * Version 5 had five chapters, no stars and hard mode open on all of them once all were cleared:
 * its clears read as one star, its hard clears as a count from chapter 1, and a player who had
 * hard mode keeps it with three stars on those five chapters.
 * Version 6 kept the claimed achievements in one number: it becomes the first word, no streak yet.
 * A save without the last falls reads as none fallen yet, one without clear times as none timed.
 * A save without stored sutras is from before the re-paced unlocks (docs/unlocks.md): it keeps
 * the relics and sutras the old gates gave (unlocks.ts keepUnlocks).
 * A save without experiment arms was offered none (experiments.ts enrolls it only while its first
 * run is still to come) and is no tester's. They came without a version: an added field changes
 * no field's meaning, and an older build keeps them (saveKeep.ts).
 */
export function parseSave(text: string | null): SaveData {
  return readSave(saveObject(text));
}

/** The stored text as an object, null for nothing or text that is not a JSON object. */
export function saveObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The version a stored object says it is, 0 for none. */
export function versionOf(raw: Record<string, unknown> | null): number {
  return typeof raw?.version === 'number' && Number.isFinite(raw.version) ? raw.version : 0;
}

/** The experiments' arms as stored: valid names only, a few at most. */
function armsOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, arm] of Object.entries(v as Record<string, unknown>).slice(0, 16)) {
    if (EXP_NAME.test(id) && typeof arm === 'string' && (arm === '' || EXP_NAME.test(arm))) out[id] = arm;
  }
  return out;
}

/** parseSave on an already parsed object (null gives a new save). */
export function readSave(raw: Record<string, unknown> | null): SaveData {
  if (!raw) return newSave();
  const max = Number.MAX_SAFE_INTEGER;
  const cleared = int(raw.cleared, 0, BALANCE.chapters, 0);
  const old = int(raw.version, 0, SAVE_VERSION, 0) < 6;
  const best = ints(raw.best, 0, BALANCE.waves);
  const hardBest = ints(raw.hardBest, 0, BALANCE.waves);
  // a cleared chapter has at least its one star, an uncleared one none
  const stars = ints(raw.stars, 0, 3).map((s, i) => (i >= cleared ? 0 : old && cleared >= OLD_CHAPTERS && i < OLD_CHAPTERS ? 3 : Math.max(1, s)));
  if (old) for (let i = 0; i < int(raw.hardCleared, 0, OLD_CHAPTERS, 0) && cleared >= OLD_CHAPTERS; i++) hardBest[i] = BALANCE.waves;
  // hard mode only where its three stars are
  for (let i = 0; i < hardBest.length; i++) if (stars[i] < 3) hardBest[i] = 0;
  const hardStars = ints(raw.hardStars, 0, 3).map((s, i) => (hardBest[i] >= BALANCE.waves ? Math.max(1, s) : 0));
  const chapter = int(raw.chapter, 1, Math.min(BALANCE.chapters, cleared + 1), 1);
  const hard = raw.hard === true && stars[chapter - 1] >= 3;
  const monks = bits(raw.monks, MONK_IDS.length, 1) | 1;
  const chests = bitsPer(raw.chests, BALANCE.chests.length);
  const hardChests = bitsPer(raw.hardChests, BALANCE.chests.length);
  const save: SaveData = {
    version: SAVE_VERSION,
    firstRunDone: raw.firstRunDone === true,
    level: int(raw.level, 1, 999, 1),
    xp: int(raw.xp, 0, max, 0),
    copper: int(raw.copper, 0, max, 0),
    jade: int(raw.jade, 0, max, 0),
    // the shown chapter can never be past the first uncleared one
    chapter,
    cleared,
    best,
    stars,
    chests,
    opened: openedOf(raw.opened, chests),
    runs: int(raw.runs, 0, max, 0),
    // the worn relic and the relics' copies: keepUnlocks below
    relic: 'ball',
    codex: Array.isArray(raw.codex) ? mergeCodex(raw.codex) : [],
    gear: inventory(raw.gear),
    sutras: bits(raw.sutras, SUTRA_IDS.length, 0),
    trained: int(raw.trained, 0, BALANCE.training.nodes, 0),
    patrol: int(raw.patrol, 0, max, 0),
    daily: parseDaily(raw.daily),
    // a save from before the dots has seen every tab it could open
    seen: bits(raw.seen, 8, 0xff),
    grit: int(raw.grit, 0, BALANCE.grit.max, 0),
    hard,
    hardBest,
    hardStars,
    hardChests,
    hardOpened: openedOf(raw.hardOpened, hardChests),
    fell: ints(raw.fell, 0, BALANCE.waves),
    hardFell: ints(raw.hardFell, 0, BALANCE.waves),
    times: ints(raw.times, 0, max),
    hardTimes: ints(raw.hardTimes, 0, max),
    monk: owned(monks, raw.monk) ? (raw.monk as MonkId) : 'kicker',
    monks,
    kills: int(raw.kills, 0, max, 0),
    achieved: achievedOf(raw.achieved),
    dice: isDice(raw.dice) ? raw.dice : 0,
    gifts: int(raw.gifts, 0, BALANCE.welcome.length, 0),
    giftDay: int(raw.giftDay, 0, 99999999, 0),
    firstDay: int(raw.firstDay, 0, 99999999, 0),
    challenge: typeof raw.challenge === 'string' && CHALLENGE_ID.test(raw.challenge) ? raw.challenge : '',
    weeks: parseWeeks(raw.weeks),
    streak: int(raw.streak, 0, max, 0),
    streakDay: int(raw.streakDay, 0, max, 0),
    bestStreak: Math.max(int(raw.bestStreak, 0, max, 0), int(raw.streak, 0, max, 0)),
    dailyBest: dailyBestOf(raw.dailyBest),
    arms: armsOf(raw.arms),
    tester: raw.tester === true,
  };
  return keepUnlocks(save, raw.relic, raw.sutras === undefined);
}
