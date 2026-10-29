import { MONK_IDS, type MonkId } from '@hk/engine';
import { hardOpenAt } from './progress';
import type { SaveData } from './save';
import { unlockedRelics } from './unlocks';

// The task boards (docs/design.md "Daily tasks"): each day, and each week, draws its tasks from a
// pool in balance.json. The draw is seeded by the date key, so a reload or a second device shows
// the same tasks; only what the save has unlocked is offered (a relic or monk task names one the
// player can take, a hard-mode task waits for hard mode). Pure: no clock, no Math.random.

export type TaskKind =
  | 'runs' | 'waves' | 'kills' | 'chests' | 'patrol' | 'elites' | 'boss' | 'evolve' | 'stars' | 'reach' | 'relic' | 'monk' | 'hard'
  /** Weekly only: days whose daily bonus was claimed. */
  | 'daily';

export const TASK_KINDS: readonly TaskKind[] = ['runs', 'waves', 'kills', 'chests', 'patrol', 'elites', 'boss', 'evolve', 'stars', 'reach', 'relic', 'monk', 'hard', 'daily'];

/** One drawn task: its kind, the count it asks for and, for a relic or monk task, which one ('' otherwise). */
export interface Task {
  kind: TaskKind;
  n: number;
  id: string;
}

export interface PoolEntry {
  kind: TaskKind;
  n: number;
  /** On every board (the easy "finish N runs"). */
  always?: boolean;
  /** Offered once this many chapters are cleared. */
  cleared?: number;
}

/** A board's state: the drawn tasks, progress per task, claimed tasks one bit each, the bonus. */
export interface Board {
  tasks: Task[];
  progress: number[];
  claimed: number;
  bonus: boolean;
}

/** What a finished run adds to the boards. */
export interface RunTally {
  waves: number;
  kills: number;
  elites: number;
  bosses: number;
  /** Spells (and the relic) evolved in the run. */
  evolved: number;
  /** The run's stars, 0 for a lost run. */
  stars: number;
  relic: string;
  monk: string;
  hard: boolean;
}

/** A run's tally with whatever is not given at none. */
export function runTally(part: Partial<RunTally>): RunTally {
  return { waves: 0, kills: 0, elites: 0, bosses: 0, evolved: 0, stars: 0, relic: '', monk: '', hard: false, ...part };
}

export const MAX_TASKS = 8;

/** A deterministic generator in [0, 1) from a seed (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ownedMonks(save: SaveData): MonkId[] {
  return MONK_IDS.filter((_, i) => i === 0 || (save.monks & (1 << i)) !== 0);
}

/** The ids a relic or monk task may name: those the player can take, the one in use last; none when there is no choice. */
function targets(save: SaveData, kind: TaskKind): string[] {
  const all: string[] = kind === 'relic' ? unlockedRelics(save) : kind === 'monk' ? ownedMonks(save) : [];
  const used = kind === 'relic' ? save.relic : save.monk;
  return all.length < 2 ? [] : all.filter((x) => x !== used);
}

/** Whether `e` can be offered to this save. */
export function eligible(save: SaveData, e: PoolEntry): boolean {
  if (save.cleared < (e.cleared ?? 0)) return false;
  if (e.kind === 'relic' || e.kind === 'monk') return targets(save, e.kind).length > 0;
  if (e.kind === 'hard') return save.stars.some((_, i) => hardOpenAt(save, i + 1));
  return true;
}

/** `count` tasks for the board keyed `key` (a yyyymmdd date): the "always" ones, then a seeded pick of the rest, in pool order. */
export function drawTasks(pool: readonly PoolEntry[], count: number, save: SaveData, key: number): Task[] {
  const rand = seeded(Math.imul(key, 2654435761) ^ 0x5bd1e995);
  const open = pool.map((e, i) => ({ e, i })).filter(({ e }) => eligible(save, e));
  const picked = open.filter(({ e }) => e.always);
  const rest = open.filter(({ e }) => !e.always);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  picked.push(...rest.slice(0, Math.max(0, Math.min(count, MAX_TASKS) - picked.length)));
  picked.sort((a, b) => a.i - b.i);
  return picked.map(({ e }) => {
    const ids = targets(save, e.kind);
    return { kind: e.kind, n: e.n, id: ids.length ? ids[Math.floor(rand() * ids.length)] : '' };
  });
}

function int(v: unknown, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
}

/** Valid tasks from whatever a save held; null when there are none. */
export function parseTasks(v: unknown): Task[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: Task[] = [];
  for (const raw of v.slice(0, MAX_TASKS)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (!TASK_KINDS.includes(r.kind as TaskKind)) return null;
    out.push({ kind: r.kind as TaskKind, n: Math.max(1, int(r.n, 1e9)), id: typeof r.id === 'string' ? r.id.slice(0, 24) : '' });
  }
  return out;
}

/** A board's progress, claims and bonus read back for `tasks`. */
export function parseBoard(raw: Record<string, unknown>, tasks: Task[]): Board {
  const progress = Array.isArray(raw.progress) ? raw.progress : [];
  return {
    tasks,
    progress: tasks.map((_, i) => int(progress[i], Number.MAX_SAFE_INTEGER)),
    claimed: int(raw.claimed, (1 << tasks.length) - 1),
    bonus: raw.bonus === true,
  };
}

/** Adds `n` to every task of `kind`. */
export function bumpBoard<B extends Board>(b: B, kind: TaskKind, n: number): B {
  if (n <= 0 || !b.tasks.some((t) => t.kind === kind)) return b;
  return { ...b, progress: b.progress.map((p, i) => (b.tasks[i].kind === kind ? p + n : p)) };
}

/** What one finished run adds to task `t` at progress `p`. */
function runStep(t: Task, p: number, r: RunTally): number {
  switch (t.kind) {
    case 'runs': return p + 1;
    case 'waves': return p + r.waves;
    case 'kills': return p + r.kills;
    case 'elites': return p + r.elites;
    case 'boss': return p + r.bosses;
    case 'evolve': return p + r.evolved;
    case 'stars': return p + r.stars;
    case 'reach': return Math.max(p, r.waves);
    case 'relic': return p + (r.relic === t.id ? 1 : 0);
    case 'monk': return p + (r.monk === t.id ? 1 : 0);
    case 'hard': return p + (r.hard ? 1 : 0);
    default: return p;
  }
}

/** The board after a finished run. */
export function runBoard<B extends Board>(b: B, r: RunTally): B {
  return { ...b, progress: b.progress.map((p, i) => runStep(b.tasks[i], p, r)) };
}

export type TaskState = 'open' | 'ready' | 'claimed';

export function boardState(b: Board, i: number): TaskState {
  if (b.claimed & (1 << i)) return 'claimed';
  return b.progress[i] >= b.tasks[i].n ? 'ready' : 'open';
}

/** The bonus waits for every task to be claimed. */
export function boardBonusReady(b: Board): boolean {
  return !b.bonus && b.tasks.every((_, i) => boardState(b, i) === 'claimed');
}

/** Tasks that can be claimed now, plus the bonus once it is ready. */
export function boardClaimable(b: Board): number {
  return b.tasks.filter((_, i) => boardState(b, i) === 'ready').length + (boardBonusReady(b) ? 1 : 0);
}

/** Two boards of the same day or week merged: the leader's tasks; when both drew the same ones, the most progress and every claim. */
export function mergeBoards<B extends Board>(lead: B, other: B): B {
  if (JSON.stringify(lead.tasks) !== JSON.stringify(other.tasks)) return lead;
  return {
    ...lead,
    progress: lead.progress.map((p, i) => Math.max(p, other.progress[i] ?? 0)),
    claimed: lead.claimed | other.claimed,
    bonus: lead.bonus || other.bonus,
  };
}
