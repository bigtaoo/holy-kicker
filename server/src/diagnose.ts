import { droppedBelowPhone, errorMsg, groupBy, has, middle, newestFirst, num, type AnomalyCount, type PerfSnap } from './perf';

// The /dash "Diagnosis": rules over the window's perf snapshots and anomaly counts (perf.ts) that
// name what looks wrong, where, with the numbers, and where in the client to look. Pure, so both
// stores share it through StatsFold. `mid` snapshots are sent only on trouble (protocol
// perfTrouble), so every rule that compares medians reads the one-per-run `end` / `leave`
// snapshots; sums of battle time take them all (healthy stretches are folded into the next one).

export interface Finding {
  level: 'bad' | 'warn';
  /** Which rule fired (leak_in_run, leak_across_runs, heap_high, memory_warning, webgl_lost, stalls, errors, slow_device, fps_regression). */
  rule: string;
  /** The build, device class, device + GPU or error source it is about. */
  where: string;
  /** Snapshots or anomalies behind it. */
  n: number;
  /** The numbers. */
  detail: string;
  /** Where in the client to look. */
  hint: string;
}

/** Fewest one-per-run snapshots a group needs before a median says anything: one odd device must not alarm. */
export const MIN_SNAPS = 5;
/** leak_in_run: runs at least this long (battle seconds), and the medians that call it a leak. */
export const LEAK_MIN_SECS = 120;
export const LEAK_HEAP_PER_MIN = 3;
export const LEAK_TEX_UP = 10;
/**
 * Display objects a mob may account for (body, shadow, eyes, hit flash, health bits); nodes that
 * grew more than NODES_PER_MOB × the most mobs alive plus LEAK_NODES_OVER_HORDE are not the horde.
 */
export const NODES_PER_MOB = 6;
export const LEAK_NODES_OVER_HORDE = 1000;
/** leak_across_runs: snapshots per side (first run of a launch vs third and later), and the start-of-run climbs that count. */
export const ACROSS_MIN = 3;
export const ACROSS_HEAP = 30;
export const ACROSS_TEX = 20;
export const ACROSS_NODES = 500;
/** heap_high: a snapshot holding this much heap or texture MB; this many are a warning, the second a problem. */
export const HIGH_HEAP_MB = 800;
export const HIGH_TEX_MB = 400;
export const HIGH_WARN = 3;
export const HIGH_BAD = 10;
/** memory_warning and webgl_lost: this many in a build is a problem. */
export const MEMORY_WARNINGS = 3;
export const WEBGL_LOST = 3;
/** stalls: this many per battle hour of a build, and at least STALLS_MIN of them. */
export const STALLS_PER_HOUR = 6;
export const STALLS_MIN = 3;
/** errors: this many of one message and source is a problem, ERROR_WARN a warning; at most TOP_ERRORS findings. */
export const ERROR_BAD = 5;
export const ERROR_WARN = 2;
export const TOP_ERRORS = 5;
/** slow_device: a device + GPU group whose median p5 is under this. */
export const SLOW_P5 = 30;
/** fps_regression: snapshots each build needs, and the p5 drop that counts. */
export const REGRESSION_MIN = 10;
export const REGRESSION_P5 = 5;

const finals = (snaps: PerfSnap[]) => snaps.filter((s) => (s.p.why === 'end' || s.p.why === 'leave') && num(s.p.secs) > 0);
/** The median of a prop over the snapshots that carry it, null under `min` of them. */
function medianOf(snaps: PerfSnap[], pick: (s: PerfSnap) => number | null, min: number): number | null {
  const xs = snaps.map(pick).filter((x): x is number => x !== null);
  return xs.length >= min ? middle(xs) : null;
}
const prop = (k: string) => (s: PerfSnap) => (has(s.p[k]) ? s.p[k] : null);
const tenth = (x: number) => Math.round(x * 10) / 10;
const signed = (x: number) => `${x >= 0 ? '+' : ''}${tenth(x)}`;
const sumN = (xs: AnomalyCount[]) => xs.reduce((t, c) => t + c.n, 0);

/** What is climbing, worst suspect first: textures, then display objects, else plain JS objects. */
function leakCause(tex: boolean, nodes: boolean): string {
  if (tex) return 'textures created and never destroyed: look for Texture/RenderTexture/generateTexture/bake calls in views (client/src/game/*View.ts, mobTypes.ts) without destroy';
  if (nodes) return 'sprites/graphics added and never removed (spell views, fx)';
  return 'plain JS objects (listeners, arrays, closures): take a heap snapshot in Chrome DevTools';
}

/** Memory climbing within runs of a build (heapUp per battle minute; secs counts since the previous snapshot, so a run with a `mid` reads a little high). */
function leakInRun(snaps: PerfSnap[]): Finding[] {
  const out: Finding[] = [];
  for (const [build, all] of groupBy(finals(snaps), (s) => s.build)) {
    const runs = all.filter((s) => num(s.p.secs) >= LEAK_MIN_SECS);
    if (runs.length < MIN_SNAPS) continue;
    const heapRate = medianOf(runs, (s) => (has(s.p.heapUp) ? (s.p.heapUp * 60) / num(s.p.secs) : null), MIN_SNAPS);
    const texUp = medianOf(runs, prop('texUp'), MIN_SNAPS);
    const nodesUp = medianOf(runs, prop('nodesUp'), MIN_SNAPS);
    const overHorde = nodesUp === null ? null : nodesUp - NODES_PER_MOB * middle(runs.map((s) => num(s.p.mobs)));
    const texLeak = texUp !== null && texUp >= LEAK_TEX_UP;
    if (!texLeak && !(heapRate !== null && heapRate >= LEAK_HEAP_PER_MIN)) continue;
    const parts = [heapRate === null ? null : `heap ${signed(heapRate)} MB per battle minute`, texUp === null ? null : `textures ${signed(texUp)}`, nodesUp === null ? null : `display objects ${signed(nodesUp)} (${signed(overHorde ?? 0)} past the horde)`];
    out.push({
      level: 'bad', rule: 'leak_in_run', where: `build ${build}`, n: runs.length,
      detail: `Medians over ${runs.length} runs of ${LEAK_MIN_SECS / 60}+ battle minutes: ${parts.filter(Boolean).join(', ')}.`,
      hint: leakCause(texLeak, overHorde !== null && overHorde >= LEAK_NODES_OVER_HORDE),
    });
  }
  return out;
}

/** Later runs of a launch starting with more held than the first: something survives a run. */
function leakAcrossRuns(snaps: PerfSnap[]): Finding[] {
  const out: Finding[] = [];
  const start = (k: string, s: PerfSnap) => (has(s.p[k]) && has(s.p[`${k}Up`]) ? s.p[k] - (s.p[`${k}Up`] as number) : null);
  for (const [build, all] of groupBy(finals(snaps), (s) => s.build)) {
    const first = all.filter((s) => num(s.p.nth) === 1), later = all.filter((s) => num(s.p.nth) >= 3);
    const climb = (k: string) => {
      const a = medianOf(first, (s) => start(k, s), ACROSS_MIN), b = medianOf(later, (s) => start(k, s), ACROSS_MIN);
      return a === null || b === null ? null : { a, b, up: b - a };
    };
    const heap = climb('heap'), tex = climb('tex'), nodes = climb('nodes');
    const texUp = !!tex && tex.up >= ACROSS_TEX, nodesUp = !!nodes && nodes.up >= ACROSS_NODES;
    if (!(texUp || nodesUp || (!!heap && heap.up >= ACROSS_HEAP))) continue;
    const say = (name: string, c: typeof heap, unit = '') => (c ? `${name} ${tenth(c.a)}${unit} → ${tenth(c.b)}${unit}` : null);
    out.push({
      level: 'bad', rule: 'leak_across_runs', where: `build ${build}`, n: first.length + later.length,
      detail: `At the start of a run, first run of a launch (${first.length}) vs third and later (${later.length}): ${[say('heap', heap, ' MB'), say('textures', tex), say('display objects', nodes)].filter(Boolean).join(', ')}.`,
      hint: `Something survives a run: the run teardown (client/src/ui/Shell.ts, the run scene's destroy) misses it. Suspect ${leakCause(texUp, nodesUp)}.`,
    });
  }
  return out;
}

/** Snapshots holding a lot of heap or texture memory, per device class. */
function heapHigh(snaps: PerfSnap[]): Finding[] {
  const high = snaps.filter((s) => num(s.p.heap) >= HIGH_HEAP_MB || num(s.p.texMB) >= HIGH_TEX_MB);
  return [...groupBy(high, (s) => s.device)].filter(([, xs]) => xs.length >= HIGH_WARN).map(([device, xs]): Finding => ({
    level: xs.length >= HIGH_BAD ? 'bad' : 'warn', rule: 'heap_high', where: device, n: xs.length,
    detail: `${xs.length} snapshots held ${HIGH_HEAP_MB}+ MB of heap or ${HIGH_TEX_MB}+ MB of textures (highest: heap ${Math.max(...xs.map((s) => num(s.p.heap)))} MB, textures ${Math.max(...xs.map((s) => num(s.p.texMB)))} MB).`,
    hint: 'Close to what a phone or tab is allowed before it is killed: check the leak findings, then the texture atlases loaded for a run (client/src/game, art in client/public/art).',
  }));
}

/** Memory warnings and lost WebGL contexts per build. */
function deviceTrouble(anomalies: AnomalyCount[]): Finding[] {
  const out: Finding[] = [];
  for (const [build, xs] of groupBy(anomalies.filter((a) => a.kind === 'memory'), (a) => a.build)) {
    const n = sumN(xs);
    if (n < MEMORY_WARNINGS) continue;
    const levels = groupBy(xs, (a) => String(a.level ?? 0));
    const by = [...levels].sort(([a], [b]) => Number(b) - Number(a)).map(([l, ys]) => `level ${l === '0' ? 'not given' : l}: ${sumN(ys)}`);
    out.push({
      level: 'bad', rule: 'memory_warning', where: `build ${build}`, n, detail: `${n} memory warnings from the host (${by.join(', ')}).`,
      hint: 'WeChat kills the game soon after a level 15 warning. Check texMB and tex in the Performance rows for this build and any leak finding.',
    });
  }
  for (const [build, xs] of groupBy(anomalies.filter((a) => a.kind === 'webgl_lost'), (a) => a.build)) {
    const n = sumN(xs);
    if (n >= WEBGL_LOST) out.push({ level: 'bad', rule: 'webgl_lost', where: `build ${build}`, n, detail: `The WebGL context was lost ${n} times: the game went black.`, hint: 'GPU memory pressure or a driver reset: check texMB in the Performance rows for this build.' });
  }
  return out;
}

/** Frames of a second or more, per battle hour of a build. */
function stalls(snaps: PerfSnap[], anomalies: AnomalyCount[]): Finding[] {
  const hours = new Map<string, number>();
  for (const s of snaps) hours.set(s.build, (hours.get(s.build) ?? 0) + num(s.p.secs) / 3600);
  const out: Finding[] = [];
  for (const [build, xs] of groupBy(anomalies.filter((a) => a.kind === 'stall'), (a) => a.build)) {
    const n = sumN(xs), h = hours.get(build) ?? 0;
    if (n < STALLS_MIN || h <= 0 || n / h < STALLS_PER_HOUR) continue;
    out.push({
      level: 'warn', rule: 'stalls', where: `build ${build}`, n, detail: `${n} stalls of a second or more in ${tenth(h)} battle hours (${tenth(n / h)} per hour).`,
      hint: 'Loading art or building textures mid-battle, shader compiles on first use, or long garbage collections: warm them up before the run starts.',
    });
  }
  return out;
}

/** The same uncaught error (message and source) seen more than once. */
function errors(anomalies: AnomalyCount[]): Finding[] {
  const groups = [...groupBy(anomalies.filter((a) => a.kind === 'error'), (a) => JSON.stringify([errorMsg(a), a.src ?? '']))];
  return groups
    .map(([k, xs]) => ({ k: JSON.parse(k) as [string, string], xs, n: sumN(xs) }))
    .filter((g) => g.n >= ERROR_WARN)
    .sort((a, b) => b.n - a.n || a.k[0].localeCompare(b.k[0]))
    .slice(0, TOP_ERRORS)
    .map(({ k: [msg, src], xs, n }): Finding => ({
      level: n >= ERROR_BAD ? 'bad' : 'warn', rule: 'errors', where: src || 'source not given', n,
      detail: `"${msg}" thrown ${n} times, builds ${[...new Set(xs.map((x) => x.build))].sort(newestFirst).join(', ')}.`,
      hint: 'An uncaught error: the file:line:col points into that build\'s minified bundle; rebuild that version with a source map to find the line.',
    }));
}

/** Device + GPU groups whose battles stutter. */
function slowDevices(snaps: PerfSnap[]): Finding[] {
  return [...groupBy(finals(snaps), (s) => `${s.device} / gpu ${s.gpu}`)]
    .map(([where, xs]) => ({ where, xs, p5: middle(xs.map((s) => num(s.p.p5))) }))
    .filter((g) => g.xs.length >= MIN_SNAPS && g.p5 < SLOW_P5)
    .map(({ where, xs, p5 }): Finding => ({
      level: 'warn', rule: 'slow_device', where, n: xs.length,
      detail: `Median p5 ${p5} fps, fps ${middle(xs.map((s) => num(s.p.fps)))}, over ${xs.length} runs; ${xs.filter((s) => droppedBelowPhone(s.p.lvMin)).length} dropped below the phone quality level; memory ${middle(xs.map((s) => s.mem))} GB, ${middle(xs.map((s) => s.cores))} cores.`,
      hint: 'The quality ladder (client/src/game/quality.ts) may start too high or drop too late there; the effects budget on that class may be too high.',
    }));
}

/** Per device class, the newest two builds with REGRESSION_MIN snapshots each: a p5 drop after a deploy. */
function fpsRegression(snaps: PerfSnap[]): Finding[] {
  const out: Finding[] = [];
  for (const [device, xs] of groupBy(finals(snaps), (s) => s.device)) {
    const builds = [...groupBy(xs, (s) => s.build)].filter(([, ys]) => ys.length >= REGRESSION_MIN).sort(([a], [b]) => newestFirst(a, b));
    if (builds.length < 2) continue;
    const [[now, a], [was, b]] = builds;
    const p5a = middle(a.map((s) => num(s.p.p5))), p5b = middle(b.map((s) => num(s.p.p5)));
    if (p5b - p5a < REGRESSION_P5) continue;
    out.push({
      level: 'bad', rule: 'fps_regression', where: device, n: a.length + b.length,
      detail: `Median p5 fell from ${p5b} fps on build ${was} (${b.length} runs) to ${p5a} fps on build ${now} (${a.length} runs).`,
      hint: `Something between builds ${was} and ${now} made battles heavier: diff client/src/game (views, effects, spawn counts) over that range.`,
    });
  }
  return out;
}

/** Every finding over the window, problems first, then the ones with the most behind them. */
export function diagnose(snaps: PerfSnap[], anomalies: AnomalyCount[]): Finding[] {
  const measured = snaps.filter((s) => num(s.p.secs) > 0);
  return [
    ...leakInRun(measured), ...leakAcrossRuns(measured), ...heapHigh(measured), ...deviceTrouble(anomalies),
    ...stalls(measured, anomalies), ...errors(anomalies), ...slowDevices(measured), ...fpsRegression(measured),
  ].sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1) || b.n - a.n || a.rule.localeCompare(b.rule) || a.where.localeCompare(b.where));
}
