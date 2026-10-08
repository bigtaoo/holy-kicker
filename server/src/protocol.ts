// The wire format between the game and its backend (server/README.md): analytics batches,
// leaderboard runs and problem reports. Shared as source by the client (`@hk/protocol`) and the server, so both
// sides agree on names and limits. Pure: no Node or browser APIs.

/** Hosts the game ships on. */
export const HOSTS = ['web', 'crazygames', 'poki', 'wechat', 'ios'] as const;
export type Host = (typeof HOSTS)[number];

/**
 * Analytics event names. `session` opens a play session; `run_start` / `run_end` bracket a
 * chapter run; `tutorial` marks the first run's hints done; `buy` a lobby purchase; `ad` a
 * rewarded ad watched to the end; `claim` a daily task, achievement or patrol paid out; `share`
 * the host's share sheet answered (WeChat: the player picked a forward); `leave` the game going to
 * the background (tab hidden, app switched), the last one of a day being where the player stopped.
 *
 * `buy` has `item` (`chest` with `kind`, `patrol` with `pay`, `monk` with `monk`, `train` with
 * `node`) and `spent` (copper for training, jade otherwise). `claim` has `what` (`task` with
 * `task`, `bonus`, `achievement` with `goal` and `all` from Claim all, `patrol` with `hours` and
 * `double`). Chests and patrols also carry their haul: `copper`, `jade` and `drops`. `share` has
 * `to` (`chat` or `moments`) and `from` (`lobby`, `run` or `results`, where the player was).
 * `leave` has `place` (`lobby`, `run`, `results` or `other`), `secs` (seconds on screen since
 * the previous `leave`) and, in a run, `chapter` and `wave`.
 */
export const EVENT_NAMES = ['session', 'run_start', 'run_end', 'tutorial', 'buy', 'ad', 'claim', 'share', 'leave'] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export type PropValue = string | number | boolean;

export interface ClientEvent {
  e: EventName;
  /** Client clock, ms since the epoch (the server keeps its own receive time too). */
  t: number;
  p?: Record<string, PropValue>;
}

export interface EventBatch {
  /** A random id kept by the install for good (not tied to any account). */
  install: string;
  /** A random id per launch. */
  session: string;
  host: Host;
  build: string;
  locale: string;
  events: ClientEvent[];
}

export const LIMITS = {
  idMin: 8,
  idMax: 64,
  batchEvents: 50,
  props: 12,
  propKey: 24,
  propString: 64,
  build: 32,
  locale: 16,
  /** A batch may be sent this late (ms; a phone offline for a day) or this early (clock skew). */
  late: 7 * 24 * 3600 * 1000,
  early: 24 * 3600 * 1000,
  chapters: 5,
  /** Waves a chapter has; a run can not go further. */
  waves: 50,
  /** A run can not be shorter than this many seconds per wave reached, nor longer than this. */
  minSecondsPerWave: 4,
  maxSeconds: 4 * 3600,
  maxLevel: 200,
  maxKills: 1_000_000,
  /** A problem report: the player's note, the device line, and the replay. */
  reportText: 2000,
  device: 300,
  /** Numbers in a replay's packed commands (5 per kept command), and its config as JSON. */
  replayNumbers: 500_000,
  replayConfig: 8 * 1024,
  /** A report's whole body; every other request stays under 32 kB. */
  reportBytes: 3 * 1024 * 1024,
  /** A portal account's name on the boards, in characters. */
  nameMin: 2,
  nameMax: 24,
} as const;

/** A finished chapter run sent to the leaderboard. */
export interface RunEntry {
  install: string;
  host: Host;
  build: string;
  chapter: number;
  hard: boolean;
  won: boolean;
  /** The wave reached (the last one when won). */
  wave: number;
  /** Seconds played, to a tenth (simulated time, so pauses and ads do not count). */
  tenths: number;
  level: number;
  kills: number;
  monk: string;
  relic: string;
  /** The portal account's name (CrazyGames only), or the player's dice name; see NameEntry. */
  name?: string;
  dice?: number;
}

/** A board's id: the chapter and the mode. */
export function boardId(chapter: number, hard: boolean): string {
  return `c${chapter}${hard ? 'h' : ''}`;
}

/**
 * What a run ranks by, higher is better: a win beats any loss, then further waves, then less
 * time. One integer so the database sorts on a single indexed field.
 */
export function runScore(r: Pick<RunEntry, 'won' | 'wave' | 'tenths'>): number {
  const fast = Math.max(0, 999_999 - Math.min(999_999, r.tenths));
  return (r.won ? 1 : 0) * 1e9 + r.wave * 1e6 + fast;
}

/** One row of a board as the server sends it. `tag` stands for the install without revealing it. */
export interface BoardRow {
  rank: number;
  tag: string;
  /** The portal account's name, else '' and the dice name (0: none, the client makes one from the tag). */
  name: string;
  dice: number;
  won: boolean;
  wave: number;
  tenths: number;
  level: number;
  monk: string;
  relic: string;
}

export interface BoardReply {
  board: string;
  total: number;
  rows: BoardRow[];
  /** The asking install's own row, when it has one. */
  mine: BoardRow | null;
}

/**
 * A replay as it goes over the wire: @hk/engine's Replay (engine/replay.ts), with the config
 * left opaque so the server does not depend on the engine.
 */
export interface ReplayWire {
  engine: number;
  config: Record<string, unknown>;
  wave: number;
  cmds: number[];
  tick: number;
  hash: number;
}

/** A problem the player reported from the pause panel, with the run so far. */
export interface Report {
  install: string;
  host: Host;
  build: string;
  locale: string;
  /** What the player wrote (may be empty: the replay alone says something). */
  text: string;
  /** The browser's user agent or the phone's model and system. */
  device: string;
  /** Where the run was: chapter, wave, hard, monk, relic. */
  chapter: number;
  wave: number;
  replay: ReplayWire | null;
}

/** A report as the operator lists it: everything but the replay's commands. */
export interface ReportSummary extends Omit<Report, 'replay'> {
  id: string;
  at: number;
  /** Ticks the replay covers, 0 without one. */
  ticks: number;
}

/**
 * A player's name on the boards (`POST /v1/name`, and with every run). Nobody types one: a
 * player signed in to a portal account goes by its name (`name`, CrazyGames only, whose names
 * the portal already moderates); everyone else by a dice name (`dice`), a word pair and a number
 * rolled from the string tables' lists, so each viewer reads it in their own language and there
 * is no player-made text to moderate. The reply is `{ ok: true }`.
 */
export interface NameEntry {
  install: string;
  host: Host;
  name?: string;
  dice?: number;
}

/** A name as the boards keep it: a portal account's, or a dice name. */
export type BoardName = { name: string } | { dice: number };

/** Words a side in the string tables' name lists (`board.adjs` / `board.nouns`), and the numbers after them. */
export const DICE = { words: 16, numMin: 10, numMax: 99 } as const;
const PAIRS = DICE.words * DICE.words;

/** A dice name packed into one integer: 1 + adjective + 16 × noun + 256 × (number − 10). */
export function packDice(adj: number, noun: number, num: number): number {
  return 1 + adj + DICE.words * noun + PAIRS * (num - DICE.numMin);
}

export function unpackDice(dice: number): { adj: number; noun: number; num: number } | null {
  if (!isDice(dice)) return null;
  const d = dice - 1;
  return { adj: d % DICE.words, noun: Math.floor(d / DICE.words) % DICE.words, num: DICE.numMin + Math.floor(d / PAIRS) };
}

export function isDice(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= PAIRS * (DICE.numMax - DICE.numMin + 1);
}

/** A new dice name, from a random source in [0, 1). */
export function rollDice(random: () => number): number {
  const pick = (n: number) => Math.min(n - 1, Math.floor(random() * n));
  return packDice(pick(DICE.words), pick(DICE.words), DICE.numMin + pick(DICE.numMax - DICE.numMin + 1));
}

export type NameCheck = { ok: true; name: string } | { ok: false; why: 'length' | 'chars' | 'rude' };

// Names nobody should wear, matched inside the name with spaces and punctuation taken out and
// digits read as letters (f4ck): rude words in the game's languages, politics a Chinese host
// refuses, and names that pass for staff. Short or common-looking ones are in WORDS instead,
// matched only as a whole word, so "glass" and "computer" stay fine.
const INSIDE = [
  'fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'bitch', 'whore', 'slut', 'rapist', 'hitler', 'porn', 'pussy', 'penis',
  'dildo', 'retard', 'asshole', 'bastard', 'wanker', 'twat', 'arschloch', 'fotze', 'wichser', 'schlampe', 'hurensohn',
  'putain', 'salope', 'connard', 'encule', 'mierda', 'cabron', 'pendejo', 'maricon', 'caralho', 'buceta', 'cazzo', 'stronzo',
  'vaffanculo', 'puttana', 'kurwa', 'pierdol', 'jebac', 'pizda', 'хуй', 'пизд', 'бляд', 'ебат', 'ебан', 'сука', 'мудак', 'пидор',
  'ちんこ', 'まんこ', '死ね', 'きちがい', '씨발', '시발', '병신', '좆', '개새끼', '傻逼', '煞笔', '操你', '草泥马', '你妈', '妈的',
  '他妈', '尼玛', '日你', '鸡巴', '屌', '婊子', '贱人', '去死', '狗日', '王八蛋', '习近平', '共产党', '法轮', '六四', '台独',
  '毛泽东', 'admin', 'moderator', 'crazygames', '官方', '客服', '管理员',
];
const WORDS = ['ass', 'cock', 'dick', 'fag', 'kys', 'nazi', 'puta', 'pute', 'merde', 'porra', 'troia', 'chuj', 'hure', 'sb', 'gm', 'poki', 'staff', 'dev'];
/** Digits read as letters: any digit for a vowel (f4ck, sh1t), and the usual ones for consonants. */
const LEET: Record<string, string> = { s: '5', t: '7', g: '69', b: '8', l: '1', z: '2' };
const looseLetters = (w: string) => [...w].map((c) => (/[aeiouy]/.test(c) ? `[${c}0-9]` : LEET[c] ? `[${c}${LEET[c]}]` : c)).join('');
const RUDE_INSIDE = new RegExp(INSIDE.map(looseLetters).join('|'));
const RUDE_WORD = new RegExp(`^(${WORDS.map(looseLetters).join('|')})$`);

/**
 * A portal account's name, cleaned (spaces folded, compatibility forms unified), or why it is
 * refused: its length, characters other than letters, digits, spaces and _ . -, or a word above.
 * The portal moderates its names already; this is the server's guard against a client that
 * sends something else as one.
 */
export function checkName(raw: string): NameCheck {
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const n = [...name].length;
  if (n < LIMITS.nameMin || n > LIMITS.nameMax) return { ok: false, why: 'length' };
  if (!/^[\p{L}\p{M}\p{N} _.-]+$/u.test(name)) return { ok: false, why: 'chars' };
  const lower = name.toLowerCase();
  if (RUDE_INSIDE.test(lower.replace(/[ _.-]/g, '')) || lower.split(/[ _.-]+/).some((w) => RUDE_WORD.test(w))) return { ok: false, why: 'rude' };
  return { ok: true, name };
}
