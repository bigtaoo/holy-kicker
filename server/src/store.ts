import { randomBytes } from 'node:crypto';
import { boardId, runScore, type BoardReply, type BoardRow, type EventBatch, type Report, type ReportSummary, type RunEntry } from './protocol';

// Where the backend keeps things. The routes only see this interface: mongoStore.ts is the real
// one, MemoryStore below serves the tests and a local run without a database.

export interface Stats {
  days: { day: string; active: number; fresh: number; runs: number; ended: number }[];
  /** Per board: runs ended, won, and the median wave of the lost ones. */
  boards: { board: string; runs: number; won: number; medianLostWave: number }[];
  /** Of the installs first seen on a day in the window, the share back 1 and 7 days later (percent). */
  retention: { day: string; fresh: number; d1: number; d7: number }[];
}

export interface Store {
  /** Keeps a checked batch received at `now` (ms). */
  addEvents(batch: EventBatch, now: number): Promise<void>;
  /** Keeps the run if it is the install's best on its board; returns the run's board and the install's rank there. */
  submitRun(run: RunEntry, tag: string, now: number): Promise<{ board: string; rank: number; best: boolean }>;
  /** The top `limit` rows of a board, and the row of `tag` (may be null). */
  board(board: string, limit: number, tag: string | null): Promise<BoardReply>;
  /** The last `days` days of numbers for the operator. */
  stats(days: number, now: number): Promise<Stats>;
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

/** In memory, for the tests and `npm run dev -w server` without HK_MONGO_URI. Stats are left empty. */
export class MemoryStore implements Store {
  readonly events: (EventBatch & { at: number })[] = [];
  readonly reportList: (Report & { id: string; at: number })[] = [];
  private readonly best = new Map<string, Best>();

  async addEvents(batch: EventBatch, now: number): Promise<void> {
    this.events.push({ ...batch, at: now });
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

  async stats(): Promise<Stats> {
    return { days: [], boards: [], retention: [] };
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
