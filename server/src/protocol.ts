// The wire format between the game and its backend (server/README.md): analytics batches,
// leaderboard runs and problem reports. Shared as source by the client (`@hk/protocol`) and the server, so both
// sides agree on names and limits. Pure: no Node or browser APIs.

/** Hosts the game ships on. */
export const HOSTS = ['web', 'crazygames', 'poki', 'playgama', 'newgrounds', 'wechat', 'ios'] as const;
export type Host = (typeof HOSTS)[number];

/** The kind of device a `session` event names in `device`. */
export const DEVICES = ['desktop', 'mobile', 'tablet'] as const;
export type Device = (typeof DEVICES)[number];

/**
 * Analytics event names. `session` opens a play session; `run_start` / `run_end` bracket a
 * chapter run; `tutorial` marks the first run's hints done; `buy` a lobby purchase; `ad` a
 * rewarded ad watched to the end; `claim` a daily task, achievement or patrol paid out; `share`
 * the host's share sheet answered (WeChat: the player picked a forward); `leave` the game going to
 * the background (tab hidden, app switched), the last one of a day being where the player stopped;
 * `iap` an in-app purchase or restore answered (iOS, the ad-free card); `alive` a minute of a run
 * on screen, so a run whose page died with no `leave` (a crash, a killed tab, a switched-off
 * computer) still shows how far it got; `run_resume` a run kept from an earlier launch picked up
 * again (meta/resume.ts), which sends no `run_start`, so its `run_end` has a start in this session.
 *
 * `session` has `runs`, `level`, `device` (DEVICES), `langs` (the host's language list), `navLangs` (the browser's), `mem`, `cores` and `gpu` (SessionDeviceProps) and on CrazyGames `sdk` (the SDK's environment and how init ended: `crazygames/ok`, `disabled/timeout`, `disabled/noscript`), `sdkMs` (init's milliseconds) and `basic` (ads held for Basic Launch). `buy` has `item` (`chest` with `kind`, `patrol` with `pay`, `monk` with `monk`, `train` with
 * `node`) and `spent` (copper for training, jade otherwise). `ad` has `at` (`lobby`, `revive` or
 * `double`) and `free` when the ad-free card paid the reward with no ad. `claim` has `what` (`task`
 * with `task`, `bonus`, `achievement` with `goal` and `all` from Claim all, `patrol` with `hours`
 * and `double`). Chests and patrols also carry their haul: `copper`, `jade` and `drops`. `share`
 * has `to` (`chat` or `moments`) and `from` (`lobby`, `run` or `results`, where the player was).
 * `leave` has `place` (`lobby`, `run`, `results` or `other`), `secs` (seconds on screen since
 * the previous `leave`) and, in a run, `chapter`, `wave`, the hero's `level`, the run's `kills`,
 * `card` (a level-up choice was open) and on the first run `tutorial` (the hint step reached) and, in a browser, `focus` (the game ever had the keys since launch) and `input` (any key or click reached it). `run_end` on a lost run has `cause`, what felled the hero (`crowd`, `touch`, `charge`, `slam`,
 * `emerge`, `bullet`, `zone`, or `level` when under-levelled for the wave). `alive` has what a `leave` in a run has
 * (`chapter`, `wave`, `level`, `kills`, `card`, `tutorial`). `run_resume` has `chapter`, `hard` and
 * `wave`. A daily challenge run's `run_start` and `run_end` also have `challenge`, the
 * challenge's id (`d20261019`). `iap` has `what` (`buy` or
 * `restore`), `item` (`adfree`) and `outcome` (`owned`, `cancelled`, `pending` or `failed`, and
 * `none` for a restore that found nothing).
 *
 * `perf` is a frame-rate snapshot of the battle so far (see PerfProps); `anomaly` one thing gone
 * wrong on the device, sent as it happens (see AnomalyProps).
 */
export const EVENT_NAMES = ['session', 'run_start', 'run_end', 'tutorial', 'buy', 'ad', 'claim', 'share', 'leave', 'iap', 'perf', 'anomaly', 'alive', 'run_resume'] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export type PropValue = string | number | boolean;

export interface ClientEvent {
  e: EventName;
  /** Client clock, ms since the epoch (the server keeps its own receive time too). */
  t: number;
  /**
   * The event's number in its launch (1, 2, ...): a batch the server kept but whose reply never
   * arrived is sent again, and the server keeps each (session, n) once. Old builds send none.
   */
  n?: number;
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

/**
 * Anonymous load checkpoints (GET /v1/beacon?h=<host>&s=<step>&b=<build>): `open_*` from the
 * portal page's inline script before anything else downloads, `loaded_*` once the game's first
 * screen is up; `touch` is a coarse pointer (phones and tablets). They carry no install id and go
 * whatever the privacy answer, so they count every launch: the share that never got past loading.
 * `quit_*` is sent by the same inline script when the page is hidden or left while still loading
 * (one that comes back and loads counts in `loaded_*` too). `script_*` and `art_*` go with
 * `loaded_*`, timing the phases of the same load: the game's script running (downloaded, parsed and
 * the portal's SDK up) and the first screen's art in (downloaded and decoded). All but `open_*`
 * carry `&ms=`, the time since the page opened, counted in LOAD_SECONDS buckets.
 */
export const BEACONS = [
  'open_desktop', 'open_touch', 'loaded_desktop', 'loaded_touch', 'quit_desktop', 'quit_touch',
  'script_desktop', 'script_touch', 'art_desktop', 'art_touch',
] as const;
export type Beacon = (typeof BEACONS)[number];

/** Upper bounds (seconds) of the load-time buckets; anything longer is `LOAD_OVER`. */
export const LOAD_SECONDS = [1, 2, 3, 5, 8, 13, 20, 30, 60] as const;
export const LOAD_OVER = '60+';

/** The bucket a load time of `ms` falls in: the first bound it is under, as a string ('3' is 2 to 3 s). */
export function loadBucket(ms: number): string {
  const bound = LOAD_SECONDS.find((s) => ms < s * 1000);
  return bound === undefined ? LOAD_OVER : String(bound);
}

/** When a `perf` snapshot is taken: the run ended, the game went to the background mid-run, or
 *  every few battle minutes while something looks wrong (PERF_MID_SECS, perfTrouble). */
export const PERF_WHY = ['end', 'leave', 'mid'] as const;
/** The GPU as a coarse class: a software renderer, a known weak phone GPU, anything else, or hidden by the browser. */
export const GPU_CLASSES = ['software', 'weak', 'other', 'hidden'] as const;

/**
 * A `perf` event's props, measured over battle frames only (lobby, pauses and card choices left
 * out), since the previous snapshot of the same run. Frame rates are whole frames per second;
 * quality levels are the client's level names (client/src/game/quality.ts LEVELS). The device
 * (memory, cores, GPU class) is not repeated here: it rides once per launch on `session`
 * (`mem`, `cores`, `gpu`).
 *
 * The memory fields locate a leak: `heap` is the JS heap (Chrome only), `tex` the GPU textures
 * the renderer holds and `nodes` the display objects on stage, each with its change since the
 * run's first battle frame (`...Up`, may be negative; nodes also grow as the horde does). The
 * start value is the current one minus the change, so later runs of a launch starting higher
 * than the first means something survives a run.
 */
export interface PerfProps {
  why: (typeof PERF_WHY)[number];
  /** Battle seconds measured in this snapshot. */
  secs: number;
  /** Median and 5th-percentile frame rate. */
  fps: number;
  p5: number;
  /** Frames of 50 ms or longer. */
  long: number;
  /** Quality level the run started on, the lowest it reached, and the one it is on now. */
  lv0: string;
  lvMin: string;
  lv: string;
  /** Most mobs alive at once. */
  mobs: number;
  /** Runs started since launch, this one included. */
  nth: number;
  /** JS heap in use and its change since the run started, MB; only where the host exposes it (Chrome's performance.memory). */
  heap?: number;
  heapUp?: number;
  /** GPU texture sources alive, their change since the run started, and their size in MB. */
  tex: number;
  texUp: number;
  texMB: number;
  /** Display objects on stage, and their change since the run started. */
  nodes: number;
  nodesUp: number;
}

/** Device fields `session` carries for perf (PerfProps): navigator.deviceMemory in GB and hardwareConcurrency (0 when the host does not say) and the GPU class. */
export interface SessionDeviceProps {
  mem: number;
  cores: number;
  gpu: (typeof GPU_CLASSES)[number];
}

/** What went wrong in an `anomaly`: the WebGL context lost, an uncaught error, the host's memory warning, or one frame stalled. */
export const ANOMALY_KINDS = ['webgl_lost', 'error', 'memory', 'stall'] as const;

/** An `anomaly` event's props. */
export interface AnomalyProps {
  kind: (typeof ANOMALY_KINDS)[number];
  /** Where the player was: `run`, `lobby`, `results` or `other` (as `leave`). */
  place: string;
  /** `error`: the message, cut to LIMITS.propString, and where it was thrown: the script's file name with line and column (`index-abc.js:1:2345`). */
  msg?: string;
  src?: string;
  /** `memory`: WeChat's warning level (5, 10 or 15 on Android; 0 when not given). */
  level?: number;
  /** `stall`: the frame's length in ms. */
  ms?: number;
  /** In a run: the wave. */
  wave?: number;
  /** `memory` and `webgl_lost`: what the game held then (as PerfProps). */
  heap?: number;
  tex?: number;
  texMB?: number;
  nodes?: number;
}

/** A frame at least this long (ms) is a `stall` anomaly; a hidden tab's gap does not count, nor
 *  one of STALL_MAX_MS or more: frames stopped without the page saying it was hidden (an iframe
 *  scrolled out of sight, a window covered), a pause rather than a hitch. */
export const STALL_MS = 1000;
export const STALL_MAX_MS = 5000;
/** At most this many `anomaly` events of each kind per session. */
export const ANOMALY_CAP = 3;
/** Battle seconds between two looks at a `mid` perf snapshot, and the most one run sends. */
export const PERF_MID_SECS = 180;
export const PERF_MID_MAX = 5;

/**
 * Whether a `mid` snapshot is worth sending: a healthy stretch is not, it is folded into the
 * run's next snapshot instead, which saves the player's data. Trouble is a slow 5th percentile,
 * frequent long frames (50 ms or longer, per battle minute), or memory climbing since the run
 * started (PERF_TROUBLE).
 */
export const PERF_TROUBLE = { p5: 40, longPerMin: 6, heapUp: 50, texUp: 30, nodesUp: 3000 } as const;
export function perfTrouble(p: Pick<PerfProps, 'secs' | 'p5' | 'long' | 'heapUp' | 'texUp' | 'nodesUp'>): boolean {
  const t = PERF_TROUBLE;
  return p.p5 < t.p5 || (p.secs > 0 && (p.long * 60) / p.secs > t.longPerMin) || (p.heapUp ?? 0) >= t.heapUp || p.texUp >= t.texUp || p.nodesUp >= t.nodesUp;
}

export const LIMITS = {
  idMin: 8,
  idMax: 64,
  batchEvents: 50,
  props: 20,
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
  /** Last week's weekly challenge tier (challengeWire.ts weekTier), worn as a mark beside the name; absent for none. */
  mark?: number;
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

export * from './challengeWire';
