import type { BoardName, BoardReply, ChallengeBoardReply, ChallengeList, ChallengeRun, ChallengeRunReply, EventBatch, EventName, Host, NameEntry, PropValue, ReplayWire, Report, RunEntry } from '@hk/protocol';
import type { Sharing } from '../meta/privacy';
import type { Platform } from '../platform/types';
import { THEME } from '../theme';
import { EventQueue, newId } from './events';

// The game's link to its backend (server/README.md): analytics batches, leaderboard runs and
// problem reports. Everything here is best effort: a failed send is retried later or dropped,
// never in the way of the game (only a report says whether it went through). The player's privacy
// answer (meta/privacy.ts) sets what may go out: with sharing held, events wait on the device; off,
// they are dropped; either way no run, name or install id leaves it. A problem report, sent only
// when the player asks for it, always goes.

/** Seconds between two analytics sends while the game runs. */
const FLUSH_EVERY = 20;
const TIMEOUT_MS = 8000;
/** A report carries a replay of up to a few MB, so it gets longer on a slow phone. */
const REPORT_TIMEOUT_MS = 45_000;
export const INSTALL_KEY = 'hk.install';
/** The backend, hk.gamestao.com (build/theme.mjs); both games share it, each naming itself (`game`, THEME). */
export const DEFAULT_API = __HK_API__;

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

export type RunResult = Omit<RunEntry, 'install' | 'host' | 'build' | 'game'>;
export type ReportDraft = Omit<Report, 'install' | 'host' | 'build' | 'locale' | 'game'>;

/** The server's answer to a run: the install's rank on the board, and whether this run is its new best there. */
export interface RunRank {
  board: string;
  rank: number;
  best: boolean;
}

export class Backend {
  private id: string | null = null;
  private sharing: Sharing = 'send';
  private readonly session = newId(Math.random);
  private readonly queue = new EventQueue();
  private sending = false;
  private leave: (() => Record<string, PropValue>) | null = null;
  private readonly hidden: (() => void)[] = [];

  constructor(
    private readonly platform: Platform,
    /** null: no backend, every call is a no-op. */
    private readonly base: string | null,
    private readonly build: string,
    private readonly locale: () => string,
  ) {
    if (!base) return;
    setInterval(() => void this.flush(), FLUSH_EVERY * 1000);
    platform.onHide(() => {
      if (this.leave) this.track('leave', this.leave());
      for (const cb of this.hidden) cb();
      void this.flushLast();
    });
  }

  /** The install's random id, made and kept the first time something needs it: a player who
   *  never shares has none stored. */
  get install(): string {
    if (this.id) return this.id;
    let id = this.platform.storage.getItem(INSTALL_KEY);
    if (!id) {
      id = newId(Math.random);
      this.platform.storage.setItem(INSTALL_KEY, id);
    }
    return (this.id = id);
  }

  /** What may go out from now on: held events go once sharing is on, and are dropped once it is off. */
  setSharing(s: Sharing): void {
    this.sharing = s;
    this.platform.analytics?.share(s !== 'off');
    if (s === 'off') this.queue.clear();
    if (s === 'send') void this.flush();
  }

  /** Says where the player is each time the game goes to the background (the `leave` event, sent at once). */
  onLeave(props: () => Record<string, PropValue>): void {
    this.leave = props;
  }

  /** Runs as the game goes to the background, after `leave` and before the flush, so what it tracks goes out with it. */
  onHidden(cb: () => void): void {
    this.hidden.push(cb);
  }

  get online(): boolean {
    return this.base !== null;
  }

  /**
   * Queues an event for the backend. The host's own analytics (Platform.analytics) gets it at once
   * unless the player turned sharing off: it is the portal's anonymous gameplay telemetry, which
   * the portal collects under its own terms, so it does not wait for the yes our backend waits for.
   */
  track(e: EventName, p?: Record<string, PropValue>): void {
    if (this.sharing !== 'off') this.platform.analytics?.event(e, p);
    if (this.base && this.sharing !== 'off') this.queue.push(e, Date.now(), p);
  }

  /**
   * The anonymous `loaded_*` checkpoint (protocol BEACONS), sent once the first screen is up and
   * whatever the privacy answer, since it has no id: against the portal page's `open_*` it shows
   * how many launches never got past loading. Touch is the same test as the page's inline script;
   * `ms` is the time since the page opened, where there is one (not on WeChat). The `script_*` and
   * `art_*` checkpoints go with it, at the times boot.ts saw those phases end (`phases`, ms).
   */
  loaded(phases: { script: number; art: number }): void {
    if (!this.base || typeof fetch !== 'function') return;
    const kind = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop';
    const timed = typeof performance !== 'undefined' && typeof document !== 'undefined';
    const steps: [string, number][] = [['script', phases.script], ['art', phases.art], ['loaded', timed ? performance.now() : 0]];
    for (const [step, ms] of timed ? steps : steps.slice(2)) {
      const q = new URLSearchParams({ h: this.platform.host, s: `${step}_${kind}`, b: this.build });
      if (THEME !== 'monk') q.set('g', THEME);
      if (timed) q.set('ms', String(Math.round(ms)));
      void fetch(`${this.base}/v1/beacon?${q}`, { mode: 'no-cors', keepalive: true }).catch(() => {});
    }
  }

  /** Sends what waits, one batch at a time; a failed batch goes back for the next try. */
  async flush(): Promise<void> {
    if (!this.base || this.sharing !== 'send' || this.sending || this.queue.size === 0) return;
    this.sending = true;
    try {
      while (this.queue.size > 0) {
        const events = this.queue.take();
        const ok = await this.send('POST', '/v1/events', this.batch(events));
        if (ok === null) {
          this.queue.restore(events);
          break;
        }
      }
    } finally {
      this.sending = false;
    }
  }

  /**
   * As the game goes to the background (perhaps for good): sends what waits at once. A batch the
   * timer still has on its way would make flush() wait, and the page may be gone before it ends,
   * taking the `leave` with it, so the rest goes out beside it.
   */
  private async flushLast(): Promise<void> {
    if (!this.sending) return this.flush();
    if (!this.base || this.sharing !== 'send' || this.queue.size === 0) return;
    const events = this.queue.take();
    if ((await this.send('POST', '/v1/events', this.batch(events))) === null) this.queue.restore(events);
  }

  private batch(events: EventBatch['events']): EventBatch {
    return { install: this.install, session: this.session, host: this.platform.host, build: this.build, locale: this.locale(), game: THEME, events };
  }

  /** Enters a finished run on its board; the reply has the install's rank there, or null offline. */
  async submitRun(run: RunResult): Promise<RunRank | null> {
    if (this.sharing !== 'send') return null;
    const entry: RunEntry = { ...run, install: this.install, host: this.platform.host, build: this.build, game: THEME };
    const r = (await this.send('POST', '/v1/runs', entry)) as Partial<RunRank> | null;
    return r && typeof r.rank === 'number' && r.rank > 0 ? (r as RunRank) : null;
  }

  /** Gives the install its name on the boards; whether the server took it. */
  async sendName(name: BoardName): Promise<boolean> {
    if (this.sharing !== 'send') return false;
    const entry: NameEntry = { install: this.install, host: this.platform.host, ...name };
    return (await this.send('POST', '/v1/name', entry)) !== null;
  }

  /** Sends a problem report with its replay; whether the server kept it. */
  async report(draft: ReportDraft): Promise<boolean> {
    const report: Report = { ...draft, install: this.install, host: this.platform.host, build: this.build, locale: this.locale(), game: THEME };
    return (await this.send('POST', '/v1/reports', report, REPORT_TIMEOUT_MS)) !== null;
  }

  /** Read as this install (with its own row) only while sharing; the top rows are anyone's. */
  async board(id: string): Promise<BoardReply | null> {
    return (await this.send('GET', `/v1/boards/${id}`)) as BoardReply | null;
  }

  /** The open challenges and the server's clock, or null offline (the lobby then shows no challenge card). */
  async challenges(): Promise<ChallengeList | null> {
    const r = (await this.send('GET', '/v1/challenge')) as Partial<ChallengeList> | null;
    return r && typeof r.now === 'number' && Array.isArray(r.challenges) ? (r as ChallengeList) : null;
  }

  /** Sends a counted challenge run with its replay, which the server re-simulates when it would rank high. */
  async submitChallengeRun(challenge: string, run: RunResult, replay: ReplayWire): Promise<ChallengeRunReply | null> {
    if (this.sharing !== 'send') return null;
    const body: ChallengeRun = { challenge, run: { ...run, install: this.install, host: this.platform.host, build: this.build, game: THEME }, replay };
    const r = (await this.send('POST', '/v1/challenge/runs', body, REPORT_TIMEOUT_MS)) as Partial<ChallengeRunReply> | null;
    return r && typeof r.rank === 'number' && typeof r.total === 'number' && typeof r.board === 'string' ? (r as ChallengeRunReply) : null;
  }

  /** A challenge board, read like board(); `pending` while the install's own run waits for its check. */
  async challengeBoard(id: string): Promise<ChallengeBoardReply | null> {
    return (await this.send('GET', `/v1/challenge/boards/${id}`)) as ChallengeBoardReply | null;
  }

  /** The replay of a weekly board's top run `tag` (ChallengeBoardReply.top), to watch; null when not kept or offline. */
  async challengeReplay(board: string, tag: string): Promise<ReplayWire | null> {
    const r = (await this.send('GET', `/v1/challenge/boards/${board}/replays/${tag}`)) as Partial<ReplayWire> | null;
    return r && Array.isArray(r.cmds) && typeof r.tick === 'number' && typeof r.engine === 'number' ? (r as ReplayWire) : null;
  }

  /** The reply's JSON ({} for an empty one), or null when anything went wrong. */
  private async send(method: 'GET' | 'POST', path: string, body?: unknown, timeout = TIMEOUT_MS): Promise<unknown> {
    if (!this.base || typeof fetch !== 'function') return null;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeout);
    try {
      const res = await fetch(this.base + path, {
        method,
        headers: { ...(this.sharing === 'send' ? { 'x-hk-install': this.install } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
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

/**
 * The languages the host reported (CrazyGames: the portal's locale alone) and the browser's own,
 * for the `session` event: they show whether players from countries with a table of their own
 * get it, or a portal set to English hides it from them.
 */
export function languageProps(platform: Pick<Platform, 'languages'>, browser: readonly string[] | undefined): Record<string, PropValue> {
  const list = (langs: readonly string[]) => langs.slice(0, 4).join(',').slice(0, 64);
  return { langs: list(platform.languages()), navLangs: list(browser ?? []) };
}
