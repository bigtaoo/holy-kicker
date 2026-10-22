import { AUDIENCE_KEYS, type Audience } from './audience';
import { diagnose, type Finding } from './diagnose';
import { anomaliesOf, perfOf, type AnomalyCount, type AnomalyStats, type PerfSnap, type PerfStats } from './perf';
import { boardId, type Game, type Host } from './protocol';
import { RETURN_DAYS, counted, dayAfter, emptyDayZero, type DayZero, type Player, type Progress } from './players';

// The operator's numbers (GET /v1/stats, the /dash page): daily actives, retention cohorts, the
// new-player funnel and what day 0 says about coming back. Pure: a store streams its players
// through StatsFold and hands over its own per-day counts, so the memory store and MongoDB
// share every rule and the memory store's tests cover them.

export interface Stats {
  /** The day the numbers were made (UTC); its counts are still growing. */
  today: string;
  /** The host the numbers are for, or null for all of them. */
  host: Host | null;
  /** The game they are for (game.ts): each game's numbers stand apart. */
  game: Game;
  /**
   * The installs the per-install numbers (cohorts, funnel, drivers, audience, clears, first run,
   * arms) are made of: one experiment's or one arm's (`exp`, null for all) and whether testers are
   * in. The per-day counts, boards, beacons, perf and anomalies are the host's whole traffic.
   */
  cohort: Cohort;
  /** Per experiment arm (`first20:short`) among the window's new installs: docs/experiments.md says how to read it. */
  arms: ArmRow[];
  days: { day: string; active: number; fresh: number; runs: number; ended: number }[];
  /**
   * Per board: runs ended, won, the median wave of the lost ones, and the waves they ended on
   * (died there, or gave up there), so a boss wave that stops many tries shows as a spike.
   */
  boards: { board: string; runs: number; won: number; medianLostWave: number; lost: { wave: number; died: number; quit: number }[] }[];
  /**
   * Per board, over the window's new installs: how many finished a run there and how many have
   * cleared it, with the median days from the first day and the median runs (the won one too)
   * it took them. Installs still trying are not in the medians.
   */
  clears: { board: string; tried: number; cleared: number; medianDays: number; medianTries: number }[];
  returnDays: number[];
  /** Per first day: new installs and how many came back returnDays later (null until that day is over). */
  cohorts: { day: string; fresh: number; back: (number | null)[] }[];
  /** How many of the window's new installs got this far on their first day. */
  funnel: { step: string; n: number }[];
  /** Of the new installs whose next day is over: how many came back then, by what they did on day 0. */
  drivers: { name: string; groups: { label: string; n: number; back: number }[] }[];
  /**
   * The window's new installs by device, browser, system and country: how many, how many finished
   * a run on day 0, and of those whose next day is over (`known`), how many came back then.
   */
  audience: { name: string; groups: { label: string; n: number; tutorial: number; ran: number; known: number; back: number }[] }[];
  /** The wave new installs' first finished run ended on, and how many of them came back the next day (D1 known only). */
  firstRun: { wave: number; n: number; back: number }[];
  /** Anonymous load checkpoints per day and build (protocol BEACONS), all launches counted. */
  beacons: BeaconCount[];
  /** Frame rates of the window's battles (src/perf.ts), by the sending install's device and system, and by build. */
  perf: PerfStats;
  /** What went wrong on devices in the window: by day, by build, the top errors, memory warnings by level. */
  anomalies: AnomalyStats;
  /** What the perf snapshots and anomalies say is wrong, problems first (src/diagnose.ts). */
  diagnosis: Finding[];
}

/** Which installs the per-install numbers count (GET /v1/stats `exp=`, `testers=1`). */
export interface Cohort {
  /** An experiment (`first20`: every arm of it) or one arm (`first20:short`); null for every install. */
  exp: string | null;
  /** Installs marked as testers count too (left out unless asked). */
  testers: boolean;
}

export const ALL_INSTALLS: Cohort = { exp: null, testers: false };

/** Whether install `p` is in `c`. */
export function inCohort(p: Pick<Player, 'exp' | 'tester'>, c: Cohort): boolean {
  if (p.tester && !c.testers) return false;
  if (c.exp === null) return true;
  return (p.exp ?? []).some((pair) => (c.exp!.includes(':') ? pair === c.exp : pair.startsWith(`${c.exp}:`)));
}

/**
 * One experiment arm's new installs: how many; of those whose next day is over (`known`), how many
 * came back then (D1, the primary); minutes on screen and second runs on day 0 (secondary);
 * rewarded ads and interstitials on day 0 (the guardrail).
 */
export interface ArmRow {
  arm: string;
  n: number;
  known: number;
  back: number;
  /** Day-0 minutes on screen, summed over the installs that reported any (`timed`). */
  minutes: number;
  timed: number;
  /** Started a second run on day 0. */
  second: number;
  ads: number;
  inters: number;
}

/** One load checkpoint's count on a day for a build. */
export interface BeaconCount {
  day: string;
  build: string;
  step: string;
  n: number;
  /** The `loaded_*` and `quit_*` counts by load-time bucket (protocol LOAD_SECONDS), if any came with a time. */
  t?: Record<string, number>;
}

/** Finished runs with the same outcome, as a store counts them. */
export interface EndCount {
  chapter: number;
  hard: boolean;
  won: boolean;
  gaveUp: boolean;
  wave: number;
  n: number;
}

/** What a store counts per day itself: installs active, runs started and runs ended. */
export interface DayCounts {
  active: Map<string, number>;
  runs: Map<string, number>;
  ended: Map<string, number>;
}

const FUNNEL: [string, (z: DayZero) => boolean][] = [
  ['opened the game', () => true],
  ['started a run', (z) => z.starts > 0],
  ['finished the tutorial', (z) => z.tutorial],
  ['finished a run', (z) => z.ends > 0],
  ['reached wave 10', (z) => z.best >= 10],
  ['reached wave 20', (z) => z.best >= 20],
  ['cleared a chapter', (z) => z.wins > 0],
  ['finished 3+ runs', (z) => z.ends >= 3],
  ['launched twice', (z) => z.sessions >= 2],
  // the ad funnel: offers drawn with an ad ready, then watched; interstitials; the iOS ad-free card
  ['was offered a rewarded ad', (z) => (z.offers ?? 0) > 0],
  ['watched a rewarded ad', (z) => z.ads > 0],
  ['saw an interstitial', (z) => (z.inters ?? 0) > 0],
  ['bought ad-free', (z) => (z.iaps ?? 0) > 0],
];

/** Picks the label of the first bucket whose bound the value is under (the last one catches the rest). */
const band = (v: number, bounds: [number, string][], rest: string) => bounds.find(([b]) => v < b)?.[1] ?? rest;

const DRIVERS: [string, (z: DayZero, build: string) => string][] = [
  ['first build played', (_, build) => build || 'unknown'],
  ['runs finished on day 0', (z) => band(z.ends, [[1, '0'], [2, '1'], [4, '2-3'], [7, '4-6']], '7+')],
  ['furthest wave on day 0', (z) => (z.wins > 0 ? 'cleared' : band(z.best, [[1, 'none'], [10, '1-9'], [20, '10-19'], [30, '20-29']], '30+'))],
  ['first run ended on wave', (z) => (z.ends === 0 ? 'no run' : band(z.firstWave, [[5, '1-4'], [10, '5-9'], [20, '10-19'], [30, '20-29']], '30+'))],
  ['minutes on screen on day 0', (z) => (z.left === '' ? 'unknown' : band(z.secs / 60, [[2, '<2'], [5, '2-5'], [15, '5-15'], [30, '15-30']], '30+'))],
  ['launches on day 0', (z) => band(z.sessions, [[2, '1'], [3, '2']], '3+')],
  ['finished the tutorial', (z) => (z.tutorial ? 'yes' : 'no')],
  ['bought in the lobby', (z) => (z.buys > 0 ? 'yes' : 'no')],
  ['rewarded ads watched on day 0', (z) => band(z.ads, [[1, '0'], [2, '1'], [4, '2-3']], '4+')],
  ['interstitials on day 0', (z) => band(z.inters ?? 0, [[1, '0'], [2, '1'], [4, '2-3']], '4+')],
  ['rewarded offers with no ad on day 0', (z) => band(z.nofill ?? 0, [[1, '0'], [3, '1-2']], '3+')],
  ['bought ad-free on day 0', (z) => ((z.iaps ?? 0) > 0 ? 'yes' : 'no')],
  ['gave up a run', (z) => (z.quits > 0 ? 'yes' : 'no')],
  ['last left the game from', (z) => (z.left === '' ? 'unknown' : z.left === 'run' ? `run, wave ${band(z.leftWave, [[5, '1-4'], [10, '5-9'], [20, '10-19']], '20+')}` : z.left)],
];

export class StatsFold {
  private readonly fresh = new Map<string, number>();
  private readonly back = new Map<string, number[]>();
  private readonly funnel = FUNNEL.map(() => 0);
  private readonly drivers = DRIVERS.map(() => new Map<string, { n: number; back: number }>());
  private readonly firstRun = new Map<number, { n: number; back: number }>();
  private readonly audience = AUDIENCE_KEYS.map(() => new Map<string, { n: number; tutorial: number; ran: number; known: number; back: number }>());
  /** Per board: installs that tried it, and [days, tries] of those that cleared it. */
  private readonly clears = new Map<string, { tried: number; days: [number, number][]; tries: [number, number][] }>();
  private readonly arms = new Map<string, ArmRow>();

  /** `days` is the window, oldest first, ending on `today` or before it. Returns stay `today`'s:
   *  a window that ended last week still shows how its installs have come back since. */
  constructor(
    private readonly days: string[],
    private readonly today: string,
  ) {}

  /** One install first seen inside the window. */
  add(p: Pick<Player, 'first' | 'back' | 'build' | 'aud' | 'exp'> & { d0?: DayZero; progress?: Record<string, Progress> }): void {
    if (p.first < this.days[0] || p.first > this.days[this.days.length - 1]) return;
    for (const [board, g] of Object.entries(p.progress ?? {})) {
      const row = this.clears.get(board) ?? { tried: 0, days: [], tries: [] };
      row.tried++;
      if (g.day >= 0) {
        row.days.push([g.day, 1]);
        row.tries.push([g.tries, 1]);
      }
      this.clears.set(board, row);
    }
    const z = { ...emptyDayZero(), ...p.d0 };
    const seen = new Set(p.back.filter(counted));
    this.fresh.set(p.first, (this.fresh.get(p.first) ?? 0) + 1);
    const back = this.back.get(p.first) ?? RETURN_DAYS.map(() => 0);
    RETURN_DAYS.forEach((n, i) => seen.has(n) && back[i]++);
    this.back.set(p.first, back);
    FUNNEL.forEach(([, reached], i) => reached(z) && this.funnel[i]++);
    // the drivers only count installs whose next day is over: a D1 still to come is not a no
    const known = dayAfter(p.first, 1) < this.today;
    const d1 = known && seen.has(1) ? 1 : 0;
    AUDIENCE_KEYS.forEach((key, i) => {
      const label = audienceLabel(p.aud, key);
      const g = this.audience[i].get(label) ?? { n: 0, tutorial: 0, ran: 0, known: 0, back: 0 };
      g.n++;
      if (z.tutorial) g.tutorial++;
      if (z.ends > 0) g.ran++;
      if (known) g.known++;
      g.back += d1;
      this.audience[i].set(label, g);
    });
    for (const arm of p.exp ?? []) {
      const r = this.arms.get(arm) ?? { arm, n: 0, known: 0, back: 0, minutes: 0, timed: 0, second: 0, ads: 0, inters: 0 };
      r.n++;
      if (known) r.known++;
      r.back += d1;
      if (z.left !== '') {
        r.timed++;
        r.minutes += Math.round(z.secs / 6) / 10;
      }
      if (z.starts >= 2) r.second++;
      r.ads += z.ads;
      r.inters += z.inters ?? 0;
      this.arms.set(arm, r);
    }
    if (!known) return;
    DRIVERS.forEach(([, label], i) => bump(this.drivers[i], label(z, p.build ?? ''), d1));
    if (z.ends > 0) bump(this.firstRun, z.firstWave, d1);
  }

  result(host: Host | null, game: Game, cohort: Cohort, counts: DayCounts, ends: EndCount[], beacons: BeaconCount[] = [], snaps: PerfSnap[] = [], anomalies: AnomalyCount[] = []): Stats {
    const at = (m: Map<string, number>, day: string) => m.get(day) ?? 0;
    return {
      today: this.today,
      host,
      game,
      cohort,
      arms: [...this.arms.values()].sort((a, b) => a.arm.localeCompare(b.arm)),
      days: this.days.map((day) => ({ day, active: at(counts.active, day), fresh: at(this.fresh, day), runs: at(counts.runs, day), ended: at(counts.ended, day) })),
      boards: boardsOf(ends),
      returnDays: [...RETURN_DAYS],
      cohorts: this.days.map((day) => {
        const back = this.back.get(day) ?? RETURN_DAYS.map(() => 0);
        return { day, fresh: at(this.fresh, day), back: RETURN_DAYS.map((n, i) => (dayAfter(day, n) < this.today ? back[i] : null)) };
      }),
      funnel: FUNNEL.map(([step], i) => ({ step, n: this.funnel[i] })),
      drivers: DRIVERS.map(([name], i) => ({ name, groups: [...this.drivers[i]].map(([label, g]) => ({ label, ...g })) })),
      audience: AUDIENCE_KEYS.map((name, i) => ({ name, groups: [...this.audience[i]].sort(([a, x], [b, y]) => y.n - x.n || a.localeCompare(b)).map(([label, g]) => ({ label, ...g })) })),
      beacons: [...beacons].sort((a, b) => a.day.localeCompare(b.day) || a.build.localeCompare(b.build) || a.step.localeCompare(b.step)),
      firstRun: [...this.firstRun].sort(([a], [b]) => a - b).map(([wave, g]) => ({ wave, ...g })),
      clears: [...this.clears]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([board, r]) => ({ board, tried: r.tried, cleared: r.days.length, medianDays: median(r.days), medianTries: median(r.tries) })),
      perf: perfOf(snaps),
      anomalies: anomaliesOf(anomalies),
      diagnosis: diagnose(snaps, anomalies),
    };
  }
}

/** An install kept before audiences were (or a field it lacks) counts as unknown. */
const audienceLabel = (aud: Audience | undefined, key: (typeof AUDIENCE_KEYS)[number]): string => aud?.[key] || 'unknown';

function bump<K>(m: Map<K, { n: number; back: number }>, key: K, back: number): void {
  const g = m.get(key) ?? { n: 0, back: 0 };
  g.n++;
  g.back += back;
  m.set(key, g);
}

/** Per board: runs, wins, the median wave of the losses and where they ended, from counted outcomes. */
export function boardsOf(ends: EndCount[]): Stats['boards'] {
  type Row = { runs: number; won: number; lost: [number, number][]; at: Map<number, { died: number; quit: number }> };
  const boards = new Map<string, Row>();
  for (const e of ends) {
    const b = boardId(e.chapter, e.hard);
    const row: Row = boards.get(b) ?? { runs: 0, won: 0, lost: [], at: new Map() };
    row.runs += e.n;
    if (e.won) row.won += e.n;
    else {
      row.lost.push([e.wave, e.n]);
      const w = row.at.get(e.wave) ?? { died: 0, quit: 0 };
      if (e.gaveUp) w.quit += e.n;
      else w.died += e.n;
      row.at.set(e.wave, w);
    }
    boards.set(b, row);
  }
  return [...boards]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([board, r]) => ({
      board, runs: r.runs, won: r.won, medianLostWave: median(r.lost),
      lost: [...r.at].sort(([a], [b]) => a - b).map(([wave, w]) => ({ wave, ...w })),
    }));
}

/** The median of weighted values [value, count]: the middle one, the upper of two. */
function median(xs: [number, number][]): number {
  const total = xs.reduce((s, [, n]) => s + n, 0);
  if (total === 0) return 0;
  const sorted = [...xs].sort(([a], [b]) => a - b);
  let seen = 0;
  for (const [v, n] of sorted) {
    seen += n;
    if (seen > Math.floor(total / 2)) return v;
  }
  return sorted[sorted.length - 1][0];
}

/** The window: `days` days ending on `to` (`?to=`) or `today`, whichever is earlier, oldest first. */
export function windowOf(days: number, today: string, to?: string): string[] {
  const last = to && to < today ? to : today;
  return Array.from({ length: days }, (_, i) => dayAfter(last, i - (days - 1)));
}
