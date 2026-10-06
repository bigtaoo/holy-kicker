import { randomBytes } from 'node:crypto';
import { counted, dayOffset, emptyDayZero, foldDayZero, type Player } from './players';
import { boardId, runScore, type BoardReply, type BoardRow, type EventBatch, type Host, type Report, type ReportSummary, type RunEntry } from './protocol';
import { dayOf } from './rules';
import { StatsFold, windowOf, type DayCounts, type EndCount, type Stats } from './stats';

// Where the backend keeps things. The routes only see this interface: mongoStore.ts is the real
// one, MemoryStore below serves the tests and a local run without a database.

export interface Store {
  /** Keeps a checked batch received at `now` (ms). */
  addEvents(batch: EventBatch, now: number): Promise<void>;
  /** Keeps the run if it is the install's best on its board; returns the run's board and the install's rank there. */
  submitRun(run: RunEntry, tag: string, now: number): Promise<{ board: string; rank: number; best: boolean }>;
  /** The top `limit` rows of a board, and the row of `tag` (may be null). */
  board(board: string, limit: number, tag: string | null): Promise<BoardReply>;
  /** The last `days` days of numbers for the operator, for one host or (null) all of them. */
  stats(days: number, now: number, host: Host | null): Promise<Stats>;
  /** Keeps a problem report received at `now`; returns its id. */
  addReport(report: Report, now: number): Promise<string>;
  /** The newest `limit` reports, without their replays' commands. */
  reports(limit: number): Promise<ReportSummary[]>;
  /** One report whole, replay and all. */
  report(id: string): Promise<(Report & { id: string; at: number }) | null>;
  close(): Promise<void>;
}

interface Best {
  board: string;
  tag: string;
  score: number;
  run: RunEntry;
  at: number;
}

/** A report's id: 16 hex digits, unguessable (the reports are only for the operator anyway). */
export function reportId(): string {
  return randomBytes(8).toString('hex');
}

export function summaryOf(r: Report, id: string, at: number): ReportSummary {
  const { replay, ...rest } = r;
  return { ...rest, id, at, ticks: replay?.tick ?? 0 };
}

export function rowOf(b: Best, rank: number): BoardRow {
  const r = b.run;
  return { rank, tag: b.tag, won: r.won, wave: r.wave, tenths: r.tenths, level: r.level, monk: r.monk, relic: r.relic };
}

/** In memory, for the tests and `npm run dev -w server` without HK_MONGO_URI. */
export class MemoryStore implements Store {
  readonly events: (EventBatch & { at: number })[] = [];
  readonly reportList: (Report & { id: string; at: number })[] = [];
  readonly players = new Map<string, Player>();
  /** `day/install` of every day an install sent anything. */
  private readonly active = new Set<string>();
  private readonly best = new Map<string, Best>();

  async addEvents(batch: EventBatch, now: number): Promise<void> {
    this.events.push({ ...batch, at: now });
    const day = dayOf(now);
    const p = this.players.get(batch.install) ?? { _id: batch.install, first: day, host: batch.host, build: batch.build, back: [], d0: emptyDayZero() };
    if (p.first === day) p.d0 = foldDayZero(p.d0, batch.events);
    const key = `${day}/${batch.install}`;
    const offset = dayOffset(p.first, day);
    if (!this.active.has(key) && counted(offset)) p.back = [...p.back, offset];
    this.active.add(key);
    this.players.set(batch.install, p);
  }

  private sorted(board: string): Best[] {
    // ties go to whoever got there first
    return [...this.best.values()].filter((b) => b.board === board).sort((a, b) => b.score - a.score || a.at - b.at);
  }

  async submitRun(run: RunEntry, tag: string, now: number) {
    const board = boardId(run.chapter, run.hard);
    const key = `${board}/${tag}`;
    const score = runScore(run);
    const old = this.best.get(key);
    const best = !old || score > old.score;
    if (best) this.best.set(key, { board, tag, score, run, at: now });
    return { board, rank: this.sorted(board).findIndex((b) => b.tag === tag) + 1, best };
  }

  async board(board: string, limit: number, tag: string | null): Promise<BoardReply> {
    const all = this.sorted(board);
    const i = tag ? all.findIndex((b) => b.tag === tag) : -1;
    return { board, total: all.length, rows: all.slice(0, limit).map((b, k) => rowOf(b, k + 1)), mine: i >= 0 ? rowOf(all[i], i + 1) : null };
  }

  async stats(days: number, now: number, host: Host | null): Promise<Stats> {
    const today = dayOf(now);
    const fold = new StatsFold(windowOf(days, today), today);
    const mine = (h: Host) => host === null || h === host;
    for (const p of this.players.values()) if (mine(p.host)) fold.add(p);
    const counts: DayCounts = { active: new Map(), runs: new Map(), ended: new Map() };
    const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const key of this.active) {
      const [day, install] = key.split('/');
      if (mine(this.players.get(install)!.host)) inc(counts.active, day);
    }
    const ends: EndCount[] = [];
    for (const b of this.events) {
      if (!mine(b.host)) continue;
      const day = dayOf(b.at);
      for (const e of b.events) {
        if (e.e === 'run_start') inc(counts.runs, day);
        if (e.e !== 'run_end') continue;
        inc(counts.ended, day);
        const p = e.p ?? {};
        ends.push({ chapter: Number(p.chapter) || 0, hard: p.hard === true, won: p.won === true, wave: Number(p.wave) || 0, n: 1 });
      }
    }
    return fold.result(host, counts, ends);
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

  async close(): Promise<void> {}
}
