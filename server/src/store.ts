import { randomBytes } from 'node:crypto';
import type { Audience } from './audience';
import { counted, dayOffset, emptyDayZero, foldDayZero, foldProgress, retag, type Player } from './players';
import { ahead, challengeUpdate, freshDoc, jobOf, settleDoc, standing, topRuns, waiting, type Best, type ChallengeDoc, type ChallengeEntry } from './challengeDocs';
import { boardJob, boardStanding, boardUpdate, boardWaiting, newBest, provisionalRank, settleBoardDoc, shown, type BoardDoc } from './boardDocs';
import { RESIM_TOP, WATCH_TOP, boardId, keptGame, type Beacon, type BoardName, type BoardReply, type BoardRow, type ChallengeBoardReply, type ChallengeRunReply, type EventBatch, type Game, type Host, type PickWire, type ReplayWire, type Report, type ReportSummary, type RunEntry } from './protocol';
import { anomalyKey, sessionDevice, type AnomalyCount, type PerfSnap } from './perf';
import { dayOf } from './rules';
import { ALL_INSTALLS, StatsFold, inCohort, windowOf, type BeaconCount, type Cohort, type DayCounts, type EndCount, type Stats } from './stats';

// Where the backend keeps things. The routes only see this interface: mongoStore.ts is the real
// one, MemoryStore below serves the tests and a local run without a database.

export interface Store {
  /** Keeps a checked batch received at `now` (ms); `aud` is kept on a new install. */
  addEvents(batch: EventBatch, now: number, aud?: Audience): Promise<void>;
  /** Counts one anonymous load checkpoint for its day, host, build and game, and its load-time bucket (protocol loadBucket) if it has one. */
  beacon(host: Host, step: Beacon, build: string, now: number, bucket: string | null, game?: Game): Promise<void>;
  /**
   * Takes a run for its chapter board (boardDocs.ts boardUpdate). A new best with a replay the
   * server can check waits for its re-simulation (`pending`, made `at`; settleBoardRun); one
   * without is not kept (`unverified`). The rank is where the run (or the install's standing
   * best, for `lower`) places among the shown rows: provisional until it is verified.
   */
  submitRun(run: RunEntry, tag: string, replay: ReplayWire | null, now: number): Promise<RunTaken>;
  /** Keeps the name the boards show for `tag`: a portal account's or a dice name. */
  setName(tag: string, name: BoardName, now: number): Promise<void>;
  /** The top `limit` rows of a board, and the row of `tag` (may be null). */
  board(board: string, limit: number, tag: string | null): Promise<BoardReply>;
  /**
   * The operator's numbers for one game (Holy Kicker's when not named) and one host or (null) all
   * of them, over the `days` days ending on `to` (a UTC day) or today, whichever is earlier.
   */
  /** `cohort` picks the installs of the per-install numbers (stats.ts Cohort); every one but testers when left out. */
  stats(days: number, now: number, host: Host | null, to?: string, game?: Game, cohort?: Cohort): Promise<Stats>;
  /** Keeps a problem report received at `now`; returns its id. */
  addReport(report: Report, now: number): Promise<string>;
  /** The newest `limit` reports, without their replays' commands. */
  reports(limit: number): Promise<ReportSummary[]>;
  /** One report whole, replay and all. */
  report(id: string): Promise<(Report & { id: string; at: number }) | null>;
  /**
   * Keeps an install's run for a challenge board (challengeDocs.ts challengeUpdate): a daily's
   * first (`repeat` after), a weekly's best (`lower` for one no better). A run that would rank in
   * the top RESIM_TOP waits with its replay until settleChallengeRun (`pending`); any other enters
   * at once (`ranked`).
   */
  challengeRun(entry: ChallengeEntry, now: number): Promise<Omit<ChallengeRunReply, 'tag'>>;
  /** The re-simulation's verdict on the run made at `at`: it enters the board with its pick timeline, or (null) is dropped. */
  settleChallengeRun(board: string, tag: string, at: number, picks: PickWire[] | null | 'stale'): Promise<void>;
  /** The re-simulation's verdict on the board run made at `at`: it shows on its board, or is dropped. */
  settleBoardRun(board: string, tag: string, at: number, ok: boolean | 'stale'): Promise<void>;
  /** Every run still waiting for its re-simulation, as references (to queue again after a restart). */
  pendingResims(): Promise<ResimRef[]>;
  /** The run and replay `ref` names, while its row still holds it waiting; else null. */
  resimJob(ref: ResimRef): Promise<ResimLoad | null>;
  /** The top `limit` rows of a challenge board, and the row of `tag` (pending or entered). */
  challengeBoard(board: string, limit: number, tag: string | null): Promise<ChallengeBoardReply>;
  /** The replay of `tag`'s run on a weekly board, while it is verified and in the top WATCH_TOP; else null. */
  challengeReplay(board: string, tag: string): Promise<ReplayWire | null>;
  /** Every board of the weekly `week` (one per engine version), as its tags in rank order. */
  weekRanks(week: string): Promise<string[][]>;
  /**
   * Deletes the `perf` and `anomaly` events older than PERF_KEEP_DAYS, at most once every
   * PRUNE_EVERY_DAYS (the last run is kept with the data, so a restart does not reset it).
   * Returns how many went, or null when it was not due. No other event or collection is touched.
   */
  prune(now: number): Promise<number | null>;
  /** Resolves once the database answers a round trip (`/health`); rejects or hangs when it does not. */
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** Raw perf telemetry is kept this many days (the longest window it matters in), then pruned weekly. */
export const PERF_KEEP_DAYS = 28;
export const PRUNE_EVERY_DAYS = 7;
/** The only events prune() deletes. */
export const PRUNED_EVENTS = ['perf', 'anomaly'] as const;
const DAY_MS = 86_400_000;

/** Whether a prune last run at `last` (ms; null: never) is due at `now`. */
export const pruneDue = (last: number | null, now: number) => last === null || now - last >= PRUNE_EVERY_DAYS * DAY_MS;
/** The first day prune() keeps: events received on an earlier day go. */
export const pruneKeepFrom = (now: number) => dayOf(now - PERF_KEEP_DAYS * DAY_MS);

export type { Best, ChallengeDoc, ChallengeEntry } from './challengeDocs';
export type { BoardDoc } from './boardDocs';

/** What submitRun did with a run. */
export interface RunTaken {
  board: string;
  rank: number;
  /** A new best for the install, kept and waiting for its re-simulation (`pending`); never for a run not kept. */
  best: boolean;
  status: 'pending' | 'lower' | 'unverified';
  at: number;
}

/** A run waiting for its re-simulation, named but not held (its replay stays in the store until its turn). */
export interface ResimRef {
  kind: 'challenge' | 'board';
  board: string;
  tag: string;
  at: number;
}

/** A waiting run as the queue steps it; `what` names it in a problem report. */
export interface ResimLoad {
  run: RunEntry;
  replay: ReplayWire;
  what: string;
}

/** The references to a challenge row's and a board row's waiting runs. */
export function resimRefs(challenges: Iterable<Pick<ChallengeDoc, 'board' | 'tag' | 'at' | 'state' | 'next'>>, boards: Iterable<Pick<BoardDoc, 'board' | 'tag' | 'at' | 'state' | 'next'>>): ResimRef[] {
  const refs: ResimRef[] = [];
  for (const d of challenges) if (d.next || d.state === 'pending') refs.push({ kind: 'challenge', board: d.board, tag: d.tag, at: d.next?.at ?? d.at });
  for (const d of boards) if (d.next || d.state === 'pending') refs.push({ kind: 'board', board: d.board, tag: d.tag, at: d.next?.at ?? d.at });
  return refs;
}

/** The run `ref` names from its row (null: gone, or no longer waiting with that run). */
export function resimLoad(ref: ResimRef, doc: ChallengeDoc | BoardDoc | null | undefined): ResimLoad | null {
  if (!doc) return null;
  if (ref.kind === 'challenge') {
    const job = jobOf(doc as ChallengeDoc);
    return job && job.at === ref.at ? { run: job.run, replay: job.replay, what: `challenge ${job.challenge}` } : null;
  }
  const job = boardJob(doc as BoardDoc);
  return job && job.at === ref.at ? { run: job.run, replay: job.replay, what: `board ${ref.board}` } : null;
}

/** A report's id: 16 hex digits, unguessable (the reports are only for the operator anyway). */
export function reportId(): string {
  return randomBytes(8).toString('hex');
}

export function summaryOf(r: Report, id: string, at: number): ReportSummary {
  const { replay, ...rest } = r;
  return { ...rest, id, at, ticks: replay?.tick ?? 0 };
}

/** A run's name, if it carried one. */
export function runName(run: RunEntry): BoardName | null {
  return run.name ? { name: run.name } : run.dice ? { dice: run.dice } : null;
}

export function rowOf(b: Best, rank: number, names: Map<string, BoardName>): BoardRow {
  const r = b.run;
  const n = names.get(b.tag);
  return { rank, tag: b.tag, name: n && 'name' in n ? n.name : '', dice: n && 'dice' in n ? n.dice : 0, won: r.won, wave: r.wave, tenths: r.tenths, level: r.level, monk: r.monk, relic: r.relic };
}

/** In memory, for the tests and `npm run dev -w server` without HK_MONGO_URI. */
export class MemoryStore implements Store {
  readonly events: (EventBatch & { at: number })[] = [];
  readonly reportList: (Report & { id: string; at: number })[] = [];
  readonly players = new Map<string, Player>();
  /** `day/install` of every day an install sent anything. */
  private readonly active = new Set<string>();
  private readonly best = new Map<string, BoardDoc>();
  /** The boards' names by tag. */
  readonly names = new Map<string, BoardName>();
  /** Load checkpoints by `day/host/build/step/game` (game empty for the first): the count, and the counts by load-time bucket. */
  readonly beacons = new Map<string, { n: number; t: Record<string, number> }>();
  /** When prune() last ran (ms), null before the first. */
  lastPrune: number | null = null;
  /** `session/n` of every numbered event kept (ClientEvent.n). */
  private readonly seen = new Set<string>();
  /** Challenge runs by `board/tag`. */
  readonly challenges = new Map<string, ChallengeDoc>();

  async beacon(host: Host, step: Beacon, build: string, now: number, bucket: string | null, game?: Game): Promise<void> {
    const key = `${dayOf(now)}/${host}/${build}/${step}/${keptGame(game) ?? ''}`;
    const b = this.beacons.get(key) ?? this.beacons.set(key, { n: 0, t: {} }).get(key)!;
    b.n++;
    if (bucket) b.t[bucket] = (b.t[bucket] ?? 0) + 1;
  }

  async addEvents(sent: EventBatch, now: number, aud?: Audience): Promise<void> {
    const events = sent.events.filter((e) => e.n === undefined || !this.seen.has(`${sent.session}/${e.n}`));
    for (const e of events) if (e.n !== undefined) this.seen.add(`${sent.session}/${e.n}`);
    if (events.length === 0) return;
    const batch = { ...sent, events };
    this.events.push({ ...batch, at: now });
    const day = dayOf(now);
    const p = this.players.get(batch.install) ?? { _id: batch.install, first: day, host: batch.host, ...(batch.game ? { game: batch.game } : {}), build: batch.build, ...(aud ? { aud } : {}), back: [], d0: emptyDayZero() };
    if (p.first === day) p.d0 = foldDayZero(p.d0, batch.events);
    const key = `${day}/${batch.install}`;
    const offset = dayOffset(p.first, day);
    if (batch.events.some((e) => e.e === 'run_end')) p.progress = foldProgress(p.progress, batch.events, offset);
    if (!this.active.has(key) && counted(offset)) p.back = [...p.back, offset];
    this.active.add(key);
    this.players.set(batch.install, { ...p, ...retag(p, batch) });
  }

  private sorted(board: string): BoardDoc[] {
    // ties go to whoever got there first
    return [...this.best.values()].filter((b) => b.board === board && shown(b)).sort((a, b) => b.score - a.score || a.at - b.at);
  }

  async submitRun(run: RunEntry, tag: string, replay: ReplayWire | null, now: number): Promise<RunTaken> {
    const board = boardId(run.chapter, run.hard, run.game);
    const key = `${board}/${tag}`;
    const old = this.best.get(key) ?? null;
    const b = newBest(board, tag, run, now);
    const doc = boardUpdate(old, b, replay);
    if (typeof doc !== 'string') this.best.set(key, doc);
    const name = runName(run);
    if (name) await this.setName(tag, name);
    // a run not kept places nowhere: the install keeps the place it had (0: none yet)
    const placed = typeof doc === 'string' ? (old && old.state !== 'stale' ? boardStanding(old) : null) : b;
    const rank = placed ? provisionalRank(placed, this.sorted(board)) : 0;
    return { board, rank, best: typeof doc !== 'string', status: typeof doc === 'string' ? doc : 'pending', at: now };
  }

  async settleBoardRun(board: string, tag: string, at: number, ok: boolean | 'stale'): Promise<void> {
    const key = `${board}/${tag}`;
    const doc = this.best.get(key);
    const next = doc && settleBoardDoc(doc, at, ok);
    if (next === null) this.best.delete(key);
    else if (next) this.best.set(key, next);
  }

  async pendingResims(): Promise<ResimRef[]> {
    return resimRefs([...this.challenges.values()].filter(waiting), [...this.best.values()].filter(boardWaiting));
  }

  async resimJob(ref: ResimRef): Promise<ResimLoad | null> {
    const key = `${ref.board}/${ref.tag}`;
    return resimLoad(ref, ref.kind === 'challenge' ? this.challenges.get(key) : this.best.get(key));
  }

  async board(board: string, limit: number, tag: string | null): Promise<BoardReply> {
    const all = this.sorted(board);
    const i = tag ? all.findIndex((b) => b.tag === tag) : -1;
    const rows = all.slice(0, limit).map((b, k) => rowOf(b, k + 1, this.names));
    return { board, total: all.length, rows, mine: i >= 0 ? rowOf(all[i], i + 1, this.names) : null };
  }

  async setName(tag: string, name: BoardName): Promise<void> {
    this.names.set(tag, name);
  }

  async stats(days: number, now: number, host: Host | null, to?: string, game: Game = 'monk', cohort: Cohort = ALL_INSTALLS): Promise<Stats> {
    const today = dayOf(now);
    const list = windowOf(days, today, to);
    const fold = new StatsFold(list, today);
    const last = list[list.length - 1];
    const g = keptGame(game);
    const mine = (h: Host, of: Game | undefined) => (host === null || h === host) && of === g;
    for (const p of this.players.values()) if (mine(p.host, p.game) && inCohort(p, cohort)) fold.add(p);
    const counts: DayCounts = { active: new Map(), runs: new Map(), ended: new Map() };
    const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const key of this.active) {
      const [day, install] = key.split('/');
      const p = this.players.get(install)!;
      if (day <= last && mine(p.host, p.game)) inc(counts.active, day);
    }
    const ends: EndCount[] = [];
    const snaps: PerfSnap[] = [];
    // the launch's device fields ride on its `session` event, whatever day it came
    const launches = new Map(this.events.flatMap((b) => b.events.filter((e) => e.e === 'session').map((e) => [b.session, e.p] as const)));
    const anomalies: AnomalyCount[] = [];
    for (const b of this.events) {
      const day = dayOf(b.at);
      if (!mine(b.host, b.game) || day < list[0] || day > last) continue;
      const aud = this.players.get(b.install)?.aud;
      for (const e of b.events) {
        if (e.e === 'perf') snaps.push({ day, host: b.host, build: b.build, device: aud?.device ?? 'unknown', os: aud?.os ?? 'unknown', ...sessionDevice(launches.get(b.session)), p: e.p ?? {} });
        if (e.e === 'anomaly') anomalies.push({ ...anomalyKey(day, b.build, e.p ?? {}), n: 1 });
        if (e.e === 'run_start') inc(counts.runs, day);
        if (e.e !== 'run_end') continue;
        inc(counts.ended, day);
        const p = e.p ?? {};
        ends.push({ chapter: Number(p.chapter) || 0, hard: p.hard === true, won: p.won === true, gaveUp: p.gaveUp === true, wave: Number(p.wave) || 0, n: 1 });
      }
    }
    const beacons: BeaconCount[] = [];
    for (const [key, { n, t }] of this.beacons) {
      const [day, h, build, step, of] = key.split('/');
      if (day >= list[0] && day <= last && mine(h as Host, (of || undefined) as Game | undefined)) beacons.push({ day, build, step, n, ...(Object.keys(t).length ? { t: { ...t } } : {}) });
    }
    return fold.result(host, game, cohort, counts, ends, beacons, snaps, anomalies);
  }

  async addReport(report: Report, now: number): Promise<string> {
    const id = reportId();
    this.reportList.push({ ...report, id, at: now });
    return id;
  }

  async reports(limit: number): Promise<ReportSummary[]> {
    return [...this.reportList].reverse().slice(0, limit).map((r) => summaryOf(r, r.id, r.at));
  }

  async report(id: string) {
    return this.reportList.find((r) => r.id === id) ?? null;
  }

  private entered(board: string): ChallengeDoc[] {
    return [...this.challenges.values()].filter((d) => d.board === board && d.state === 'entered').sort((a, b) => (ahead(a, b) ? -1 : 1));
  }

  private place(doc: ChallengeDoc): { rank: number; total: number } {
    const entered = this.entered(doc.board);
    return { rank: entered.filter((d) => ahead(d, doc)).length + 1, total: entered.length + (doc.state === 'pending' ? 1 : 0) };
  }

  async challengeRun(e: ChallengeEntry, now: number) {
    const key = `${e.board}/${e.tag}`;
    const old = this.challenges.get(key) ?? null;
    const doc = challengeUpdate(old, e, now, this.place(freshDoc(e, now)).rank <= RESIM_TOP);
    if (typeof doc === 'string') return { board: e.board, status: doc, ...this.place(standing(old!)) };
    this.challenges.set(key, doc);
    const name = runName(e.run);
    if (name) await this.setName(e.tag, name);
    return { board: e.board, status: waiting(doc) ? ('pending' as const) : ('ranked' as const), ...this.place(standing(doc)) };
  }

  async settleChallengeRun(board: string, tag: string, at: number, picks: PickWire[] | null | 'stale'): Promise<void> {
    const key = `${board}/${tag}`;
    const doc = this.challenges.get(key);
    const next = doc && settleDoc(doc, at, picks);
    if (next === null) this.challenges.delete(key);
    else if (next) this.challenges.set(key, next);
  }

  async challengeBoard(board: string, limit: number, tag: string | null): Promise<ChallengeBoardReply> {
    const entered = this.entered(board);
    const own = tag ? this.challenges.get(`${board}/${tag}`) : undefined;
    const rows = entered.slice(0, limit).map((d, k) => rowOf(d, k + 1, this.names));
    const total = entered.length + (own?.state === 'pending' ? 1 : 0);
    return { board, total, rows, mine: own ? rowOf(own, this.place(own).rank, this.names) : null, pending: own ? waiting(own) : false, top: topRuns(board, entered) };
  }

  async challengeReplay(board: string, tag: string): Promise<ReplayWire | null> {
    const doc = this.challenges.get(`${board}/${tag}`);
    if (!doc?.replay || doc.state !== 'entered' || !doc.verified) return null;
    return this.place(doc).rank <= WATCH_TOP ? doc.replay : null;
  }

  async weekRanks(week: string): Promise<string[][]> {
    const boards = new Set([...this.challenges.values()].map((d) => d.board).filter((b) => b.startsWith(`${week}-`)));
    return [...boards].map((b) => this.entered(b).map((d) => d.tag));
  }

  async prune(now: number): Promise<number | null> {
    if (!pruneDue(this.lastPrune, now)) return null;
    const keep = pruneKeepFrom(now);
    const old = (e: { e: string }) => (PRUNED_EVENTS as readonly string[]).includes(e.e);
    let n = 0;
    for (const b of this.events) {
      if (dayOf(b.at) >= keep) continue;
      const kept = b.events.filter((e) => !old(e));
      n += b.events.length - kept.length;
      b.events = kept;
    }
    this.lastPrune = now;
    return n;
  }

  async ping(): Promise<void> {}

  async close(): Promise<void> {}
}
