import type { BoardReply, EventBatch, EventName, Host, PropValue, Report, RunEntry } from '@hk/protocol';
import type { Platform } from '../platform/types';
import { EventQueue, newId } from './events';

// The game's link to its backend (server/README.md): analytics batches, leaderboard runs and
// problem reports. Everything here is best effort: a failed send is retried later or dropped,
// never in the way of the game (only a report says whether it went through).

/** Seconds between two analytics sends while the game runs. */
const FLUSH_EVERY = 20;
const TIMEOUT_MS = 8000;
/** A report carries a replay of up to a few MB, so it gets longer on a slow phone. */
const REPORT_TIMEOUT_MS = 45_000;
const INSTALL_KEY = 'hk.install';
export const DEFAULT_API = 'https://hk.gamestao.com';

/**
 * Where the backend is, or null for none: `?api=` overrides (`off`, or a URL such as
 * http://localhost:8080 for a local server); development builds stay offline otherwise, and so
 * does WeChat, whose request whitelist needs an ICP-filed domain the backend does not have yet.
 */
export function apiBase(host: Host, dev: boolean, query: URLSearchParams, configured: string | undefined): string | null {
  const q = query.get('api');
  if (q === 'off') return null;
  if (q) return q.replace(/\/+$/, '');
  if (dev || host === 'wechat') return null;
  return (configured || DEFAULT_API).replace(/\/+$/, '');
}

export type RunResult = Omit<RunEntry, 'install' | 'host' | 'build'>;
export type ReportDraft = Omit<Report, 'install' | 'host' | 'build' | 'locale'>;

/** The server's answer to a run: the install's rank on the board, and whether this run is its new best there. */
export interface RunRank {
  board: string;
  rank: number;
  best: boolean;
}

export class Backend {
  readonly install: string;
  private readonly session = newId(Math.random);
  private readonly queue = new EventQueue();
  private sending = false;
  private leave: (() => Record<string, PropValue>) | null = null;

  constructor(
    private readonly platform: Platform,
    /** null: no backend, every call is a no-op. */
    private readonly base: string | null,
    private readonly build: string,
    private readonly locale: () => string,
  ) {
    let install = platform.storage.getItem(INSTALL_KEY);
    if (!install) {
      install = newId(Math.random);
      platform.storage.setItem(INSTALL_KEY, install);
    }
    this.install = install;
    if (!base) return;
    setInterval(() => void this.flush(), FLUSH_EVERY * 1000);
    platform.onHide(() => {
      if (this.leave) this.track('leave', this.leave());
      void this.flush();
    });
  }

  /** Says where the player is each time the game goes to the background (the `leave` event, sent at once). */
  onLeave(props: () => Record<string, PropValue>): void {
    this.leave = props;
  }

  get online(): boolean {
    return this.base !== null;
  }

  track(e: EventName, p?: Record<string, PropValue>): void {
    if (this.base) this.queue.push(e, Date.now(), p);
  }

  /** Sends what waits, one batch at a time; a failed batch goes back for the next try. */
  async flush(): Promise<void> {
    if (!this.base || this.sending || this.queue.size === 0) return;
    this.sending = true;
    try {
      while (this.queue.size > 0) {
        const events = this.queue.take();
        const batch: EventBatch = { install: this.install, session: this.session, host: this.platform.host, build: this.build, locale: this.locale(), events };
        const ok = await this.send('POST', '/v1/events', batch);
        if (ok === null) {
          this.queue.restore(events);
          break;
        }
      }
    } finally {
      this.sending = false;
    }
  }

  /** Enters a finished run on its board; the reply has the install's rank there, or null offline. */
  async submitRun(run: RunResult): Promise<RunRank | null> {
    const entry: RunEntry = { ...run, install: this.install, host: this.platform.host, build: this.build };
    const r = (await this.send('POST', '/v1/runs', entry)) as Partial<RunRank> | null;
    return r && typeof r.rank === 'number' && r.rank > 0 ? (r as RunRank) : null;
  }

  /** Sends a problem report with its replay; whether the server kept it. */
  async report(draft: ReportDraft): Promise<boolean> {
    const report: Report = { ...draft, install: this.install, host: this.platform.host, build: this.build, locale: this.locale() };
    return (await this.send('POST', '/v1/reports', report, REPORT_TIMEOUT_MS)) !== null;
  }

  async board(id: string): Promise<BoardReply | null> {
    return (await this.send('GET', `/v1/boards/${id}`)) as BoardReply | null;
  }

  /** The reply's JSON ({} for an empty one), or null when anything went wrong. */
  private async send(method: 'GET' | 'POST', path: string, body?: unknown, timeout = TIMEOUT_MS): Promise<unknown> {
    if (!this.base || typeof fetch !== 'function') return null;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeout);
    try {
      const res = await fetch(this.base + path, {
        method,
        headers: { 'x-hk-install': this.install, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: abort.signal,
        // a batch sent as the tab goes away still arrives (browsers cap keepalive bodies at 64 kB)
        keepalive: method === 'POST' && timeout === TIMEOUT_MS,
      });
      if (!res.ok) return null;
      return res.status === 204 ? {} : await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
