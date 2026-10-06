import type { ClientEvent, Host } from './protocol';

// What the backend remembers about each install for retention: the day it was first seen, the
// later days it came back, and what it did on its first day (day 0). Kept on the install's own
// document and folded as batches arrive, so the stats read one small document per new player
// instead of their events. Pure: the stores call it, the tests drive it.

/** Days after the first on which coming back is counted (D1, D3, ...). */
export const RETURN_DAYS = [1, 3, 7, 14, 30] as const;
const LAST_RETURN = RETURN_DAYS[RETURN_DAYS.length - 1];
const DAY_MS = 86_400_000;

/** Where the player was when the game went to the background (the `leave` event). */
export const PLACES = ['lobby', 'run', 'results', 'other'] as const;

export interface DayZero {
  /** Launches, run starts, runs finished (died, won or gave up), runs won, runs given up. */
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
  /** The build the install first played (version+commit), to compare releases' new players. */
  build?: string;
  /** Days after `first`, up to the last of RETURN_DAYS, on which the install was seen again. */
  back: number[];
  d0: DayZero;
}

export function emptyDayZero(): DayZero {
  return { sessions: 0, starts: 0, ends: 0, wins: 0, quits: 0, best: 0, firstWave: 0, tutorial: false, buys: 0, ads: 0, secs: 0, left: '', leftWave: 0 };
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
        if (p.won === true) z.wins++;
        if (p.gaveUp === true) z.quits++;
        z.best = Math.max(z.best, wave);
        break;
      }
      case 'tutorial':
        z.tutorial = true;
        break;
      case 'buy':
        z.buys++;
        break;
      case 'ad':
        z.ads++;
        break;
      case 'leave':
        z.secs += Math.min(num(p.secs), 4 * 3600);
        z.left = (PLACES as readonly unknown[]).includes(p.place) ? String(p.place) : 'other';
        z.leftWave = z.left === 'run' ? num(p.wave) : 0;
        break;
    }
  }
  return z;
}
