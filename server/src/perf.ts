import type { PropValue } from './protocol';

// The client's frame-rate snapshots (`perf`) and device trouble (`anomaly`) as the operator reads
// them on /dash: per device class, system and build, the worst snapshots, and the anomalies by day.
// Pure: a store hands over the window's snapshots (with the install's device and system and the
// launch's GPU class, memory and cores from its `session` event) and its anomaly counts, so the
// memory store and MongoDB share every rule. The volume is small (one `end` or `leave` snapshot
// per run, `mid` ones only on trouble), so medians are taken over the snapshots themselves.

/** The client's quality levels, lowest first (client/src/game/quality.ts LEVELS). */
export const QUALITY_LEVELS = ['crawl', 'slow', 'saver', 'low', 'mid', 'phone', 'high'] as const;
/** A run whose lowest level is under this one dropped below what phones are meant to run. */
const PHONE = QUALITY_LEVELS.indexOf('phone');
/** Snapshots shorter than this (battle seconds) stay out of the worst list: a hitch is not a device. */
export const WORST_MIN_SECS = 30;
const WORST = 10;
const TOP_ERRORS = 10;

/** One `perf` event of the window, with the device and system of the install that sent it and the
 *  launch's device fields (protocol SessionDeviceProps; 'unknown' and 0 without a `session` event). */
export interface PerfSnap {
  day: string;
  host: string;
  build: string;
  device: string;
  os: string;
  gpu: string;
  mem: number;
  cores: number;
  p: Record<string, PropValue>;
}

/** `anomaly` events of the window with the same day, build, kind, message, source and level, as a store counts them. */
export interface AnomalyCount {
  day: string;
  build: string;
  kind: string;
  msg?: string;
  src?: string;
  level?: number;
  n: number;
}

/** The numbers of one group of snapshots. */
export interface PerfRow {
  label: string;
  /** Snapshots, and the battle minutes they measured. */
  snaps: number;
  minutes: number;
  /** Medians over the snapshots of their median and 5th-percentile frame rates. */
  fps: number;
  p5: number;
  /** Frames of 50 ms or longer per battle minute. */
  longPerMin: number;
  /** Snapshots whose run had dropped below the `phone` quality level by then. */
  low: number;
  /** Median JS heap in MB over the snapshots that had one, else null. */
  heap: number | null;
  /** Medians of GPU textures alive, their MB and display objects on stage, over the snapshots that had them (builds from 2026-10-15 on), else null. */
  tex: number | null;
  texMB: number | null;
  nodes: number | null;
  /** `mid` snapshots among them: sent only on trouble (protocol perfTrouble), so a group with many is a group in trouble. */
  mids: number;
  /** Pacing (protocol PerfProps; null without snapshots that carry it, builds before 2026-10-20). */
  pacing: Pacing | null;
}

/** What a group's snapshots with pacing fields say: how often frames came late and why. */
export interface Pacing {
  /** Median display refresh, Hz. */
  hz: number;
  /** Hitches (frames that missed a refresh) and refreshes missed, per battle minute. */
  hitchPerMin: number;
  missPerMin: number;
  /** Percent of the hitches after our own slow work, with a boss or elite standing, in a wave's first seconds. */
  work: number;
  boss: number;
  wave: number;
  /** Medians of the frame work's 95th percentile (ms): all of it, engine steps, view update, draw. */
  work95: number;
  sim95: number;
  view95: number;
  draw95: number;
}

export interface WorstSnap {
  day: string;
  host: string;
  build: string;
  device: string;
  os: string;
  gpu: string;
  mem: number;
  cores: number;
  secs: number;
  fps: number;
  p5: number;
  lvMin: string;
  mobs: number;
  /** MB of GPU textures and display objects then, null from builds before they were sent. */
  texMB: number | null;
  nodes: number | null;
  /** Its pacing (as PerfRow), null from builds before it was sent. */
  pacing: Pacing | null;
}

export interface PerfStats {
  byDevice: PerfRow[];
  byOs: PerfRow[];
  /** Newest build first, so a regression after a deploy shows on top. */
  byBuild: PerfRow[];
  /** The snapshots of at least WORST_MIN_SECS with the lowest p5. */
  worst: WorstSnap[];
}

export interface AnomalyStats {
  days: { day: string; kind: string; n: number }[];
  /** Per build, newest first, and kind. */
  builds: { build: string; kind: string; n: number }[];
  /** The most frequent `error` messages, by message and where they were thrown ('' when not given). */
  errors: { msg: string; src: string; n: number }[];
  /** `memory` warnings by WeChat's level (0: not given). */
  memory: { level: number; n: number }[];
}

/** A number prop, or 0. */
export const num = (v: PropValue | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** Whether a prop is a number (snapshots from older builds lack some). */
export const has = (v: PropValue | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
/** Builds newest first, by their numbers: the order of `byBuild` and of fps_regression (diagnose.ts). */
export const newestFirst = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });
const str = (v: PropValue | undefined) => (typeof v === 'string' && v ? v : 'unknown');
const tenth = (x: number) => Math.round(x * 10) / 10;
const share = (n: number, of: number) => (of > 0 ? Math.round((n * 100) / of) : 0);

/** The pacing of snapshots, from those that carry it (`hitch`); null for none. */
export function pacingOf(all: PerfSnap[]): Pacing | null {
  const snaps = all.filter((x) => has(x.p.hitch));
  if (!snaps.length) return null;
  const sum = (k: string) => snaps.reduce((t, x) => t + num(x.p[k]), 0);
  const secs = sum('secs'), hitch = sum('hitch');
  const mid = (k: string) => middle(snaps.map((x) => num(x.p[k])));
  return {
    hz: mid('hz'),
    hitchPerMin: secs > 0 ? tenth((hitch * 60) / secs) : 0,
    missPerMin: secs > 0 ? tenth((sum('miss') * 60) / secs) : 0,
    work: share(sum('hitchWork'), hitch),
    boss: share(sum('hitchBoss'), hitch),
    wave: share(sum('hitchWave'), hitch),
    work95: mid('work95'),
    sim95: mid('sim95'),
    view95: mid('view95'),
    draw95: mid('draw95'),
  };
}

/** The middle value, the upper of two; 0 for none. */
export function middle(xs: number[]): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Whether a run's lowest quality level is below `phone`; an unknown level is not counted. */
export function droppedBelowPhone(lvMin: PropValue | undefined): boolean {
  const i = (QUALITY_LEVELS as readonly unknown[]).indexOf(lvMin);
  return i >= 0 && i < PHONE;
}

function rowOf(label: string, snaps: PerfSnap[]): PerfRow {
  const secs = snaps.reduce((s, x) => s + num(x.p.secs), 0);
  const long = snaps.reduce((s, x) => s + num(x.p.long), 0);
  const heaps = snaps.filter((x) => num(x.p.heap) > 0).map((x) => num(x.p.heap));
  const mid = (k: string) => {
    const xs = snaps.filter((x) => has(x.p[k])).map((x) => num(x.p[k]));
    return xs.length ? middle(xs) : null;
  };
  return {
    label,
    snaps: snaps.length,
    minutes: tenth(secs / 60),
    fps: middle(snaps.map((x) => num(x.p.fps))),
    p5: middle(snaps.map((x) => num(x.p.p5))),
    longPerMin: secs > 0 ? tenth((long * 60) / secs) : 0,
    low: snaps.filter((x) => droppedBelowPhone(x.p.lvMin)).length,
    heap: heaps.length ? middle(heaps) : null,
    tex: mid('tex'),
    texMB: mid('texMB'),
    nodes: mid('nodes'),
    mids: snaps.filter((x) => x.p.why === 'mid').length,
    pacing: pacingOf(snaps),
  };
}

/** Items by key, in first-seen order; an empty key is 'unknown'. */
export function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x) || 'unknown';
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** A launch's device fields from its `session` event's props (protocol SessionDeviceProps), the defaults without one. */
export function sessionDevice(p: Record<string, PropValue> | undefined): Pick<PerfSnap, 'gpu' | 'mem' | 'cores'> {
  return { gpu: typeof p?.gpu === 'string' && p.gpu ? p.gpu : 'unknown', mem: num(p?.mem), cores: num(p?.cores) };
}

const rows = (m: Map<string, PerfSnap[]>) => [...m].map(([label, xs]) => rowOf(label, xs));
const bySize = (a: PerfRow, b: PerfRow) => b.snaps - a.snaps || a.label.localeCompare(b.label);

/** The window's perf numbers from its snapshots; one with no battle seconds measured nothing and is left out. */
export function perfOf(all: PerfSnap[]): PerfStats {
  const snaps = all.filter((s) => num(s.p.secs) > 0);
  return {
    byDevice: rows(groupBy(snaps, (s) => s.device)).sort(bySize),
    byOs: rows(groupBy(snaps, (s) => s.os)).sort(bySize),
    byBuild: rows(groupBy(snaps, (s) => s.build)).sort((a, b) => newestFirst(a.label, b.label)),
    worst: snaps
      .filter((s) => num(s.p.secs) >= WORST_MIN_SECS)
      .sort((a, b) => num(a.p.p5) - num(b.p.p5) || num(a.p.fps) - num(b.p.fps))
      .slice(0, WORST)
      .map((s) => ({
        day: s.day, host: s.host, build: s.build, device: s.device, os: s.os, gpu: s.gpu, mem: s.mem, cores: s.cores,
        secs: num(s.p.secs), fps: num(s.p.fps), p5: num(s.p.p5), lvMin: str(s.p.lvMin), mobs: num(s.p.mobs),
        texMB: has(s.p.texMB) ? s.p.texMB : null, nodes: has(s.p.nodes) ? s.p.nodes : null, pacing: pacingOf([s]),
      })),
  };
}

function add<K>(m: Map<K, number>, k: K, n: number): void {
  m.set(k, (m.get(k) ?? 0) + n);
}

/** An error's message, or a stand-in for one sent without. */
export const errorMsg = (c: Pick<AnomalyCount, 'msg'>) => c.msg || '(no message)';
const pair = (k: string) => JSON.parse(k) as [string, string];

/** The window's anomalies by day and kind, by build and kind, the top errors (message and source) and the memory warnings by level. */
export function anomaliesOf(counts: AnomalyCount[]): AnomalyStats {
  const days = new Map<string, number>();
  const builds = new Map<string, number>();
  const errors = new Map<string, number>();
  const memory = new Map<number, number>();
  for (const c of counts) {
    const kind = c.kind || 'unknown';
    add(days, `${c.day}/${kind}`, c.n);
    add(builds, JSON.stringify([c.build || 'unknown', kind]), c.n);
    if (kind === 'error') add(errors, JSON.stringify([errorMsg(c), c.src ?? '']), c.n);
    if (kind === 'memory') add(memory, c.level ?? 0, c.n);
  }
  return {
    days: [...days]
      .map(([k, n]) => ({ day: k.slice(0, 10), kind: k.slice(11), n }))
      .sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind)),
    builds: [...builds].map(([k, n]) => ({ build: pair(k)[0], kind: pair(k)[1], n })).sort((a, b) => newestFirst(a.build, b.build) || a.kind.localeCompare(b.kind)),
    errors: [...errors]
      .map(([k, n]) => ({ msg: pair(k)[0], src: pair(k)[1], n }))
      .sort((a, b) => b.n - a.n || a.msg.localeCompare(b.msg) || a.src.localeCompare(b.src))
      .slice(0, TOP_ERRORS),
    memory: [...memory].map(([level, n]) => ({ level, n })).sort((a, b) => a.level - b.level),
  };
}

/** One anomaly event's count key from its batch's day and build and its props, as both stores read them. */
export function anomalyKey(day: string, build: string, p: Record<string, PropValue>): Omit<AnomalyCount, 'n'> {
  return {
    day,
    build,
    kind: typeof p.kind === 'string' ? p.kind : 'unknown',
    ...(typeof p.msg === 'string' ? { msg: p.msg } : {}),
    ...(typeof p.src === 'string' ? { src: p.src } : {}),
    ...(typeof p.level === 'number' && Number.isFinite(p.level) ? { level: p.level } : {}),
  };
}
