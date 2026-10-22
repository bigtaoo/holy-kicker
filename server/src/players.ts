import type { Audience } from './audience';
import { LIMITS, boardId, expPairs, type ClientEvent, type EventBatch, type Game, type Host } from './protocol';

// What the backend remembers about each install for retention: the day it was first seen, the
// later days it came back, what it did on its first day (day 0) and how it got through each board.
// Kept on the install's own document and folded as batches arrive, so the stats read one small
// document per new player instead of their events. Pure: the stores call it, the tests drive it.

/** Days after the first on which coming back is counted (D1, D3, ...). */
export const RETURN_DAYS = [1, 3, 7, 14, 30] as const;
const LAST_RETURN = RETURN_DAYS[RETURN_DAYS.length - 1];
const DAY_MS = 86_400_000;

/** Where the player was when the game went to the background (the `leave` event). */
export const PLACES = ['lobby', 'run', 'results', 'other'] as const;

export interface DayZero {
  /** Launches, run starts, runs finished (died, won or gave up), chapters cleared (cleared()), runs given up. */
  sessions: number;
  starts: number;
  ends: number;
  wins: number;
  quits: number;
  /** The furthest wave of any finished run, and the wave the first finished run ended on (0: none). */
  best: number;
  firstWave: number;
  tutorial: boolean;
  buys: number;
  ads: number;
  /** Interstitials shown, rewarded offers drawn with an ad ready and drawn with none (`offer`), ad-free cards bought (iOS). Missing before they were kept. */
  inters?: number;
  offers?: number;
  nofill?: number;
  iaps?: number;
  /** Seconds with the game on screen (summed from `leave`). */
  secs: number;
  /** Where the last `leave` of the day happened ('' when none came), and the run's wave there. */
  left: string;
  leftWave: number;
}

export interface Player {
  _id: string;
  /** The first day seen, YYYY-MM-DD (UTC). */
  first: string;
  host: Host;
  /** The game it plays (game.ts), none for the first. */
  game?: Game;
  /** The build the install first played (version+commit), to compare releases' new players. */
  build?: string;
  /** Its device, browser, system and country, from the first batch (audience.ts). Missing before it was kept. */
  aud?: Audience;
  /** Days after `first`, up to the last of RETURN_DAYS, on which the install was seen again. */
  back: number[];
  d0: DayZero;
  /** Per board (`c4`, `c4h`): how the install got to its first clear. Missing before it was kept. */
  progress?: Record<string, Progress>;
  /** Its experiment arms (`first20:short`, from the batches' `exp`); missing when in none. */
  exp?: string[];
  /** Marked a tester in the game's settings: the stats leave it out unless asked. */
  tester?: true;
}

/** The arms and the tester mark a batch carries, as kept on its install. */
export function tagsOf(b: Pick<EventBatch, 'exp' | 'tester'>): Pick<Player, 'exp' | 'tester'> {
  const exp = expPairs(b.exp);
  return { ...(exp.length > 0 && { exp }), ...(b.tester && { tester: true as const }) };
}

/** The install's tags to change after batch `b` (a newer arm list, the tester mark), or null when they stand. A batch from an older build, with no `exp`, leaves the arms kept; the mark is never taken back. */
export function retag(p: Pick<Player, 'exp' | 'tester'>, b: Pick<EventBatch, 'exp' | 'tester'>): Pick<Player, 'exp' | 'tester'> | null {
  const t = tagsOf(b);
  const exp = t.exp && t.exp.join(',') !== (p.exp ?? []).join(',') ? { exp: t.exp } : {};
  const tester = t.tester && !p.tester ? { tester: t.tester } : {};
  return exp.exp || tester.tester ? { ...exp, ...tester } : null;
}

/** A `run_end` that cleared its chapter: won, and as long as the chapter (runWire.ts RUN_BUILD on `waves`). */
export function cleared(p: Record<string, unknown>): boolean {
  return p.won === true && (p.waves === undefined || p.waves === LIMITS.waves);
}

/** Runs finished on a board up to and including the first won one, and the day of that win after `first` (-1: not yet). */
export interface Progress {
  tries: number;
  day: number;
}

export function emptyDayZero(): DayZero {
  return { sessions: 0, starts: 0, ends: 0, wins: 0, quits: 0, best: 0, firstWave: 0, tutorial: false, buys: 0, ads: 0, inters: 0, offers: 0, nofill: 0, iaps: 0, secs: 0, left: '', leftWave: 0 };
}

/** Whole days from `first` to `day` (both YYYY-MM-DD). */
export function dayOffset(first: string, day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY_MS);
}

/** The day `n` days after `day`. */
export function dayAfter(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whether a return `offset` days after `first` is worth keeping. */
export function counted(offset: number): boolean {
  return offset >= 1 && offset <= LAST_RETURN;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);

/** Day 0 after a batch of the install's first-day events. */
export function foldDayZero(d: DayZero | undefined, events: readonly ClientEvent[]): DayZero {
  const z = { ...emptyDayZero(), ...d };
  for (const ev of events) {
    const p = ev.p ?? {};
    switch (ev.e) {
      case 'session':
        z.sessions++;
        break;
      case 'run_start':
        z.starts++;
        break;
      case 'run_end': {
        const wave = num(p.wave);
        if (z.ends === 0) z.firstWave = wave;
        z.ends++;
        if (cleared(p)) z.wins++;
        if (p.gaveUp === true) z.quits++;
        z.best = Math.max(z.best, wave);
        break;
      }
      case 'tutorial':
        // sent as each hint step is reached; older builds sent one bare event when done
        if (p.step === undefined || p.step === 'done') z.tutorial = true;
        break;
      case 'buy':
        z.buys++;
        break;
      case 'ad':
        // one the ad-free card paid (iOS) was never watched
        if (p.kind === 'inter') z.inters = (z.inters ?? 0) + 1;
        else if (p.free !== true) z.ads++;
        break;
      case 'offer':
        if (p.outcome === 'shown') z.offers = (z.offers ?? 0) + 1;
        if (p.outcome === 'nofill') z.nofill = (z.nofill ?? 0) + 1;
        break;
      case 'iap':
        if (p.what === 'buy' && p.outcome === 'owned') z.iaps = (z.iaps ?? 0) + 1;
        break;
      case 'leave':
        z.secs += Math.min(num(p.secs), 4 * 3600);
        z.left = (PLACES as readonly unknown[]).includes(p.place) ? String(p.place) : 'other';
        z.leftWave = z.left === 'run' ? num(p.wave) : 0;
        break;
      case 'alive':
      case 'run_resume':
        // still in a run: where a page that died with no `leave` last was
        z.left = 'run';
        z.leftWave = num(p.wave);
        break;
    }
  }
  return z;
}

/** The boards' progress after a batch that arrived `offset` days after the install's first. */
export function foldProgress(progress: Record<string, Progress> | undefined, events: readonly ClientEvent[], offset: number): Record<string, Progress> {
  const out = { ...progress };
  for (const ev of events) {
    if (ev.e !== 'run_end') continue;
    const p = ev.p ?? {};
    const chapter = num(p.chapter);
    if (chapter < 1 || chapter > LIMITS.chapters) continue;
    const board = boardId(chapter, p.hard === true);
    const g = out[board] ?? { tries: 0, day: -1 };
    if (g.day >= 0) continue;
    out[board] = { tries: g.tries + 1, day: cleared(p) ? Math.max(0, offset) : -1 };
  }
  return out;
}
