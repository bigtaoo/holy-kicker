#!/usr/bin/env node
// Compares the first-hours numbers of a host's newest build with the one before it, so a
// regression after an upload shows within hours (docs/retention.md "Checking a new upload").
//
//   node tools/launch_check.mjs --host crazygames [--game corgi] [--since 2026-10-14] [--builds aa727bc,baee706]
//        [--all] [--ssh blightbloom] [--save dump.json | --load dump.json]
//
// Both games share the backend and a commit's build id (server/src/game.ts): --game picks one,
// Holy Kicker's (`monk`) when not given.
//
// Reads production MongoDB through the hk-api container on the backend box (ssh, then
// `docker exec`; read only). Without --builds it compares the two newest builds that sent a
// `session` since --since (default: 14 days ago). Each build is looked at over the same age, the
// time the newest one has been up (--all: everything since --since). Events are ordered by the
// device clock `t`, never the receive time; duplicates of old builds (sent twice, no `n`) are
// folded by session, name, time and props.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const MIN = 60_000;
const HOUR = 60 * MIN;
const LIVE_MS = 15 * MIN;

function parseArgs(argv) {
  const a = { host: 'crazygames', game: 'monk', since: null, builds: null, all: false, ssh: 'blightbloom', save: null, load: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (k === 'all') a.all = true;
    else if (k in a) a[k] = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  a.since ??= new Date(Date.now() - 14 * 24 * HOUR).toISOString();
  a.since = new Date(a.since).toISOString();
  if (typeof a.builds === 'string') a.builds = a.builds.split(',').map((s) => s.trim()).filter(Boolean);
  return a;
}

// Runs inside the hk-api container (CommonJS, its own mongodb driver): picks the builds and
// returns their installs, events, load beacons and problem reports as JSON on stdout.
async function remote(A) {
  const { MongoClient } = require('/app/node_modules/mongodb');
  const c = await MongoClient.connect(process.env.HK_MONGO_URI);
  try {
    const db = c.db(process.env.HK_MONGO_DB);
    const since = new Date(A.since);
    const ev = db.collection('events');
    // the first game's documents carry no `game`
    const mine = { host: A.host, game: A.game === 'monk' ? { $exists: false } : A.game };
    // a build's first launch by receive time: one device with its clock behind would move it
    const seen = await ev.aggregate([
      { $match: { ...mine, e: 'session', at: { $gte: since } } },
      { $group: { _id: '$build', n: { $sum: 1 }, first: { $min: '$at' } } },
      { $sort: { first: 1 } },
    ]).toArray();
    let builds = seen.slice(-2).map((s) => s._id);
    if (A.builds) {
      builds = A.builds.map((b) => seen.find((s) => s._id === b) ?? seen.find((s) => s._id.includes(b)));
      if (builds.some((b) => !b)) throw new Error(`no sessions of ${A.builds} since ${A.since}; seen: ${seen.map((s) => s._id)}`);
      builds = builds.sort((a, b) => a.first - b.first).map((s) => s._id);
    }
    const installs = await db.collection('installs').find({ ...mine, build: { $in: builds } }).toArray();
    const ids = installs.map((i) => i._id);
    const events = await ev.find(
      { at: { $gte: since }, $or: [{ install: { $in: ids } }, { ...mine, build: { $in: builds } }] },
      { projection: { at: 0, day: 0, host: 0, locale: 0 } },
    ).toArray();
    const beacons = await db.collection('beacons').find({ ...mine, build: { $in: builds } }).toArray();
    const reports = await db.collection('reports').find({ ...mine, build: { $in: builds } }, { projection: { replay: 0 } }).toArray();
    process.stdout.write(JSON.stringify({ now: Date.now(), seen, builds, installs, events, beacons, reports }));
  } finally {
    await c.close();
  }
}

function fetchData(args) {
  const A = { host: args.host, game: args.game, since: args.since, builds: args.builds };
  const script = `(${remote.toString()})(${JSON.stringify(A)}).catch((e) => { console.error(e.message); process.exit(1); });\n`;
  const file = `/tmp/hk_launch_check_${process.pid}.cjs`;
  const cmd = `docker exec -i hk-api sh -c "cat > ${file} && node ${file}; s=\\$?; rm -f ${file}; exit \\$s"`;
  const r = spawnSync('ssh', [args.ssh, cmd], { input: script, maxBuffer: 1 << 30, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`remote query failed (${r.status}): ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

// --- helpers ------------------------------------------------------------------------------

const short = (b) => b.replace(/^\d+\.\d+\.\d+\+/, '').replace(/-dirty$/, '*');
const touchOf = (d) => (d == null ? null : d === 'desktop' ? 'desktop' : 'touch');
const DEVICES = ['desktop', 'touch'];
const ENDS = new Set(['run_end', 'leave']);
const isRun = (e) => e.e === 'run_start' || e.e === 'run_resume';
// builds before per-step tutorial events sent one bare `tutorial` when the hints were done
const tutorialDone = (e) => e.e === 'tutorial' && (e.p?.step ?? 'done') === 'done';

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mmss = (s) => (s == null ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const pct = (a, b) => (b ? `${a}/${b} ${Math.round((100 * a) / b)}%` : '–');

/** The median of a beacon's time buckets (`t`: upper bound in seconds → count), as "<3s". */
function bucketMedian(t, n) {
  if (!t || !n) return '';
  const keys = Object.keys(t).sort((a, b) => (a === '60+' ? 1e9 : +a) - (b === '60+' ? 1e9 : +b));
  let acc = 0;
  for (const k of keys) {
    acc += t[k];
    if (acc * 2 >= n) return k === '60+' ? ' >60s' : ` <${k}s`;
  }
  return '';
}

/** Events as the device saw them: duplicates folded, ordered by `t` (then the launch's number `n`). */
function prepare(raw) {
  const seen = new Set();
  const out = [];
  for (const e of raw) {
    const key = `${e.session}|${e.e}|${e.t}|${JSON.stringify(e.p ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const n = typeof e._id === 'string' ? +e._id.split('/').pop() : 0;
    out.push({ ...e, p: e.p ?? {}, t: Date.parse(e.t), n });
  }
  return out.sort((a, b) => a.t - b.t || a.n - b.n);
}

function groupBy(xs, key) {
  const m = new Map();
  for (const x of xs) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function emptyCell() {
  return {
    installs: 0, sessions: 0, noRun: 0, first: 0, on60: 0, d0: [],
    move: 0, move0: 0, moveK: 0, moveFI: 0, moveNoFocus: 0, moveNoInput: 0,
    runs: 0, orphan: 0, live: 0, orphanWaves: [], resumes: 0,
    died: 0, replay: 0, second: 0, lobby: 0,
    anomaly: {}, perfMid: 0, reports: 0,
    beacons: {},
  };
}

// --- analysis -----------------------------------------------------------------------------

function analyse(data, args) {
  const now = data.now;
  const events = prepare(data.events);
  const firstOf = Object.fromEntries(data.seen.map((s) => [s._id, Date.parse(s.first)]));
  const newest = Math.max(...data.builds.map((b) => firstOf[b]));
  const span = args.all ? Infinity : now - newest;
  const windowEnd = Object.fromEntries(data.builds.map((b) => [b, firstOf[b] + span]));

  const sessDev = new Map();
  for (const e of events) if (e.e === 'session' && e.p.device) sessDev.set(e.session, touchOf(e.p.device));
  const instDev = new Map(data.installs.map((i) => [i._id, touchOf(i.aud?.device)]));
  const devOf = (e) => sessDev.get(e.session) ?? instDev.get(e.install) ?? null;

  const cells = {};
  for (const b of data.builds) cells[b] = { desktop: emptyCell(), touch: emptyCell() };
  const feat = Object.fromEntries(data.builds.map((b) => [b, { alive: false, numbered: false, focus: false, script: false, perf: false }]));
  for (const e of events) {
    const f = feat[e.build];
    if (!f) continue;
    if (e.e === 'alive') f.alive = true;
    if (e.e === 'perf' || e.e === 'anomaly') f.perf = true;
    if (e.n) f.numbered = true;
    if (e.e === 'leave' && 'focus' in e.p) f.focus = true;
  }

  // Players new on each build, followed through their first run.
  const byInstall = groupBy(events, (e) => e.install);
  for (const inst of data.installs) {
    const all = byInstall.get(inst._id) ?? [];
    const start = all[0]?.t ?? Infinity;
    const b = inst.build;
    if (!cells[b] || start > windowEnd[b]) continue;
    const evs = all.filter((e) => e.t <= windowEnd[b]);
    const dev = instDev.get(inst._id) ?? (evs[0] && devOf(evs[0]));
    if (!dev) continue;
    const c = cells[b][dev];
    c.installs++;
    c.d0.push(inst.d0?.secs ?? 0);
    firstRun(c, evs);
  }

  // Every launch on each build, new players or not.
  const bySession = groupBy(events.filter((e) => cells[e.build]), (e) => e.session);
  for (const evs of bySession.values()) {
    const b = evs[0].build;
    if (evs[0].t > windowEnd[b]) continue;
    const dev = devOf(evs[0]);
    if (!dev) continue;
    const c = cells[b][dev];
    if (evs.some((e) => e.e === 'session')) c.sessions++;
    sessionRuns(c, evs, now);
    for (const e of evs) {
      if (e.e === 'anomaly') c.anomaly[e.p.kind] = (c.anomaly[e.p.kind] ?? 0) + 1;
      if (e.e === 'perf' && e.p.why === 'mid') c.perfMid++;
    }
  }

  for (const r of data.reports) {
    const at = Date.parse(r.at);
    if (!cells[r.build] || at > windowEnd[r.build]) continue;
    cells[r.build][/Mobile|Android|iPhone|iPad/.test(r.device) ? 'touch' : 'desktop'].reports++;
  }

  // Beacons count per UTC day, so the window is only as fine as whole days.
  const lastDay = Object.fromEntries(data.builds.map((b) => [b, new Date(Math.min(windowEnd[b], now)).toISOString().slice(0, 10)]));
  for (const bc of data.beacons) {
    if (!cells[bc.build] || bc.day > lastDay[bc.build]) continue;
    const [phase, dev] = bc.step.split('_');
    if (phase === 'script') feat[bc.build].script = true;
    const slot = (cells[bc.build][dev].beacons[phase] ??= { n: 0, t: {} });
    slot.n += bc.n;
    for (const [k, v] of Object.entries(bc.t ?? {})) slot.t[k] = (slot.t[k] ?? 0) + v;
  }
  return { cells, feat, firstOf, windowEnd, span, now, lastDay };
}

/** The install's first run: time on screen, where a first run left off, what came next. */
function firstRun(c, evs) {
  const i0 = evs.findIndex((e) => e.e === 'run_start');
  if (i0 < 0) {
    c.noRun++;
    return;
  }
  c.first++;
  // a run kept and resumed in a later launch is still the first run, up to the next run_start
  let next = evs.findIndex((e, k) => k > i0 && e.e === 'run_start');
  if (next < 0) next = evs.length;
  const run = evs.slice(i0, next);
  const end = run.find((e) => e.e === 'run_end');
  const leaves = run.filter((e) => e.e === 'leave' && e.p.place === 'run');
  const onScreen = Math.max(
    (end?.p.tenths ?? 0) / 10,
    leaves.reduce((s, e) => s + (+e.p.secs || 0), 0),
    60 * run.filter((e) => e.e === 'alive').length,
  );
  if (onScreen >= 60) c.on60++;

  const lastLeave = leaves[leaves.length - 1];
  if (!end && run.length > 1 && lastLeave?.p.tutorial === 'move' && !run.some(tutorialDone)) {
    c.move++;
    if (+lastLeave.p.kills > 0) c.moveK++;
    else c.move0++;
    if ('focus' in lastLeave.p) {
      c.moveFI++;
      if (lastLeave.p.focus === false) c.moveNoFocus++;
      if (lastLeave.p.input === false) c.moveNoInput++;
    }
  }

  const iEnd = end ? evs.indexOf(end) : -1;
  if (end && end.p.won === false && !end.p.gaveUp) {
    c.died++;
    if (evs.some((e, k) => k > iEnd && e.e === 'run_start' && e.session === end.session)) c.replay++;
  }
  if (next < evs.length) c.second++;
  const after = evs.slice(iEnd >= 0 ? iEnd + 1 : i0 + 1);
  const lobby = (e) =>
    e.p.place === 'lobby' || e.e === 'buy' || e.e === 'share' || e.e === 'iap' ||
    (e.e === 'claim' && e.p.what !== 'gift') || (e.e === 'run_start' && !e.p.again && !e.p.next);
  if (after.some(lobby)) c.lobby++;
}

/** Runs of one launch: how many, resumed, and those that stopped with no ending (the page died). */
function sessionRuns(c, evs, now) {
  const live = evs[evs.length - 1].t > now - LIVE_MS;
  evs.forEach((e, i) => {
    if (!isRun(e)) return;
    c.runs++;
    if (e.e === 'run_resume') c.resumes++;
    const rest = evs.slice(i + 1);
    const k = rest.findIndex(isRun);
    const seg = k < 0 ? rest : rest.slice(0, k);
    if (seg.some((x) => ENDS.has(x.e))) return;
    if (live && k < 0) {
      c.live++;
      return;
    }
    c.orphan++;
    const alive = seg.filter((x) => x.e === 'alive').pop();
    c.orphanWaves.push(alive ? alive.p.wave : e.e === 'run_resume' ? `r${e.p.wave}` : null);
  });
}

// --- report -------------------------------------------------------------------------------

function render(res, data, args) {
  const { cells, feat, firstOf, windowEnd, span, now } = res;
  const builds = data.builds;
  const cols = DEVICES.flatMap((d) => builds.map((b) => ({ b, d, c: cells[b][d] })));
  const W = 17;
  const lines = [];
  const at = (t) => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
  lines.push(`Launch check · host ${args.host} · since ${args.since.slice(0, 16)} · now ${at(now)} UTC`);
  for (const b of builds) {
    const age = (Math.min(windowEnd[b], now) - firstOf[b]) / HOUR;
    const f = feat[b];
    const has = [f.numbered && 'n', f.alive && 'alive', f.perf && 'perf', f.focus && 'focus', f.script && 'script/art'].filter(Boolean);
    lines.push(`  ${short(b).padEnd(10)} ${b}  first session ${at(firstOf[b])}, ${age.toFixed(1)} h looked at${has.length ? `  [${has.join(', ')}]` : ''}`);
  }
  lines.push(span === Infinity ? '  window: everything since --since' : `  window: each build's first ${(span / HOUR).toFixed(1)} h (beacons: whole UTC days up to ${builds.map((b) => res.lastDay[b]).join(' / ')})`);
  lines.push('');

  const head = ''.padEnd(30) + cols.map(({ b, d }) => `${d} ${short(b)}`.padStart(W)).join('');
  const out = [head, '-'.repeat(head.length)];
  const row = (label, f) => out.push(label.padEnd(30) + cols.map((x) => String(f(x.c, x.b) ?? '–').padStart(W)).join(''));
  const section = (t) => out.push(`${t}`);

  section('Players');
  row('  new installs', (c) => c.installs);
  row('  sessions (all players)', (c) => c.sessions);
  section('Load beacons (median bucket)');
  for (const phase of ['open', 'script', 'art', 'loaded', 'quit']) {
    row(`  ${phase}`, (c, b) => {
      const s = c.beacons[phase];
      if (!s) return (phase === 'script' || phase === 'art') && !feat[b].script ? '–' : 0;
      return `${s.n}${bucketMedian(s.t, s.n)}`;
    });
  }
  row('  loaded / open', (c) => pct(c.beacons.loaded?.n ?? 0, c.beacons.open?.n ?? 0));
  section('First run (new installs)');
  row('  never started a run', (c) => pct(c.noRun, c.installs));
  row('  on screen 60 s+ (conv.)', (c) => pct(c.on60, c.first));
  row('  day-0 on screen, median', (c) => mmss(median(c.d0)));
  row('  ended at tutorial `move`', (c) => pct(c.move, c.first));
  row('    with 0 kills / kills', (c) => `${c.move0} / ${c.moveK}`);
  row('    no focus / no input', (c, b) => (feat[b].focus ? `${c.moveNoFocus} / ${c.moveNoInput} of ${c.moveFI}` : '–'));
  row('  died', (c) => pct(c.died, c.first));
  row('  replayed after 1st death', (c) => pct(c.replay, c.died));
  row('  started a 2nd run', (c) => pct(c.second, c.first));
  row('  reached the lobby', (c) => pct(c.lobby, c.first));
  section('Runs (all players)');
  row('  runs (incl. resumed)', (c) => c.runs);
  row('  no ending (page died)', (c) => pct(c.orphan, c.runs));
  row('  run_resume', (c) => c.resumes);
  row('  still live (<15 min)', (c) => c.live);
  section('Trouble');
  const perf = (f) => (c, b) => (feat[b].perf ? f(c) : '–');
  row('  anomaly stall', perf((c) => c.anomaly.stall ?? 0));
  row('  anomaly error/gl/memory', perf((c) => `${c.anomaly.error ?? 0}/${c.anomaly.webgl_lost ?? 0}/${c.anomaly.memory ?? 0}`));
  row('  perf mid (trouble)', perf((c) => c.perfMid));
  row('  problem reports', (c) => c.reports);
  lines.push(...out, '');

  lines.push('Runs with no ending, wave last seen (from `alive`; rN = resumed at wave N; ? = no alive):');
  for (const { b, d, c } of cols) {
    if (!c.orphan) continue;
    const w = c.orphanWaves.map((x) => x ?? '?').join(' ');
    lines.push(`  ${d} ${short(b)}: ${w}`);
  }
  return lines.join('\n');
}

// --- main ---------------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const data = args.load ? JSON.parse(readFileSync(args.load, 'utf8')) : fetchData(args);
if (args.save) writeFileSync(args.save, JSON.stringify(data));
if (data.builds.length < 1) throw new Error(`no ${args.host} sessions since ${args.since}`);
console.log(render(analyse(data, args), data, args));
