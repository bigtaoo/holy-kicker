import { createHmac, timingSafeEqual } from 'node:crypto';
import { audienceOf } from './audience';
import { challengeFor, misfit, openChallenges } from './challenge';
import { marked } from './marks';
import { BEACONS, CHALLENGE_BOARD, HOSTS, LIMITS, challengeBoardId, loadBucket, type Beacon, type Host } from './protocol';
import { checkBatch, checkChallengeRun, checkNameEntry, checkReport, checkRun } from './rules';
import type { ResimJob } from './challengeDocs';
import type { Store } from './store';

// The HTTP API (server/README.md), as a function from a parsed request to a reply so the tests
// drive it without sockets; index.ts does the networking. Every player route is anonymous and
// keyed by the install id, which never leaves the server: boards show a tag made from it.

export interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  /** The parsed JSON body (undefined when there was none or it did not parse). */
  body: unknown;
  ip: string;
}

export interface Reply {
  status: number;
  body?: unknown;
}

export interface Deps {
  store: Store;
  /** Secret mixed into the tags, so a tag cannot be turned back into an install id. */
  tagSalt: string;
  /** Bearer key for the operator's stats; empty turns the route off. */
  adminKey: string;
  now(): number;
  /** Rate limit: false when `key` asked for `route` too often. */
  allow(route: string, key: string): boolean;
  /** Where pending challenge runs go to be re-simulated (resimQueue.ts). */
  resim: { push(job: ResimJob): void };
  /** Last week's weekly tiers by tag, for the marks beside the names on the boards (marks.ts WeekMarks); none without. */
  marks?: { current(): Promise<ReadonlyMap<string, number>> };
}

export const BOARD_ROWS = 50;
const BOARD = /^c[1-9]h?$/;
const REPORT = /^\/v1\/reports\/[0-9a-f]{16}$/;
const TAG = /^[A-Za-z0-9_-]{10}$/;

export function tagOf(install: string, salt: string): string {
  return createHmac('sha256', salt).update(install).digest('base64url').slice(0, 10);
}

function keyMatches(given: string | undefined, key: string): boolean {
  if (!key || !given?.startsWith('Bearer ')) return false;
  const a = Buffer.from(given.slice(7));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bad = (reason: string): Reply => ({ status: 400, body: { error: reason } });

/** The asking install's tag, from its `x-hk-install` header (a board shows its own row). */
function installTag(req: Req, d: Deps): string | null {
  const install = req.headers['x-hk-install'];
  return install && install.length >= LIMITS.idMin && install.length <= LIMITS.idMax ? tagOf(install, d.tagSalt) : null;
}

export async function route(req: Req, d: Deps): Promise<Reply> {
  const { method, path } = req;
  if (method === 'GET' && path === '/health') return { status: 200, body: { ok: true } };

  if (method === 'POST' && path === '/v1/events') {
    if (!d.allow('events', req.ip)) return { status: 429 };
    const c = checkBatch(req.body, d.now());
    if (!c.ok) return bad(c.reason);
    await d.store.addEvents(c.value, d.now(), audienceOf(req.headers, c.value.events));
    return { status: 204 };
  }

  // anonymous load checkpoints: a GET with no body or preflight, so a page's inline script can send it
  if (method === 'GET' && path === '/v1/beacon') {
    if (!d.allow('beacons', req.ip)) return { status: 429 };
    const host = req.query.get('h') ?? '', step = req.query.get('s') ?? '', build = req.query.get('b') ?? '';
    if (!(HOSTS as readonly string[]).includes(host) || !(BEACONS as readonly string[]).includes(step)) return bad('bad beacon');
    if (!/^[\w.+-]{1,32}$/.test(build)) return bad('bad build');
    // the load time, if any: whole milliseconds, under an hour
    const ms = req.query.get('ms');
    if (ms !== null && !/^\d{1,7}$/.test(ms)) return bad('bad ms');
    await d.store.beacon(host as Host, step as Beacon, build, d.now(), ms === null ? null : loadBucket(Number(ms)));
    return { status: 204 };
  }

  if (method === 'POST' && path === '/v1/runs') {
    if (!d.allow('runs', req.ip)) return { status: 429 };
    const c = checkRun(req.body);
    if (!c.ok) return bad(c.reason);
    const tag = tagOf(c.value.install, d.tagSalt);
    const r = await d.store.submitRun(c.value, tag, d.now());
    return { status: 200, body: { ...r, tag } };
  }

  if (method === 'POST' && path === '/v1/name') {
    if (!d.allow('names', req.ip)) return { status: 429 };
    const c = checkNameEntry(req.body);
    if (!c.ok) return bad(c.reason);
    await d.store.setName(tagOf(c.value.install, d.tagSalt), c.value.name, d.now());
    return { status: 200, body: { ok: true } };
  }

  const board = path.startsWith('/v1/boards/') ? path.slice('/v1/boards/'.length) : null;
  if (method === 'GET' && board !== null) {
    if (!d.allow('boards', req.ip)) return { status: 429 };
    if (!BOARD.test(board) || Number(board[1]) > LIMITS.chapters) return bad('bad board');
    return { status: 200, body: marked(await d.store.board(board, BOARD_ROWS, installTag(req, d)), (await d.marks?.current()) ?? new Map()) };
  }

  if (method === 'GET' && path === '/v1/challenge') {
    if (!d.allow('boards', req.ip)) return { status: 429 };
    return { status: 200, body: { now: d.now(), challenges: openChallenges(d.now()) } };
  }

  if (method === 'POST' && path === '/v1/challenge/runs') {
    if (!d.allow('challenge', req.ip)) return { status: 429 };
    const c = checkChallengeRun(req.body);
    if (!c.ok) return bad(c.reason);
    const { run, replay } = c.value;
    const challenge = challengeFor(c.value.challenge, d.now());
    if (!challenge) return bad('closed');
    const why = misfit(challenge, run, replay);
    if (why) return bad(why);
    const tag = tagOf(run.install, d.tagSalt);
    const entry = { board: challengeBoardId(challenge.id, challenge.engine, run.chapter), tag, challenge: challenge.id, run, replay };
    const now = d.now();
    const r = await d.store.challengeRun(entry, now);
    if (r.status === 'pending') d.resim.push({ ...entry, at: now });
    return { status: 200, body: { ...r, tag } };
  }

  const cboard = path.startsWith('/v1/challenge/boards/') ? path.slice('/v1/challenge/boards/'.length) : null;
  if (method === 'GET' && cboard !== null) {
    if (!d.allow('boards', req.ip)) return { status: 429 };
    // a weekly top run's replay, to watch: <board>/replays/<tag>
    const [name, replays, tag, ...rest] = cboard.split('/');
    if (!CHALLENGE_BOARD.test(name)) return bad('bad board');
    if (replays !== undefined) {
      if (replays !== 'replays' || !TAG.test(tag ?? '') || rest.length) return { status: 404 };
      const replay = await d.store.challengeReplay(name, tag);
      return replay ? { status: 200, body: replay } : { status: 404 };
    }
    return { status: 200, body: marked(await d.store.challengeBoard(name, BOARD_ROWS, installTag(req, d)), (await d.marks?.current()) ?? new Map()) };
  }

  if (method === 'POST' && path === '/v1/reports') {
    if (!d.allow('reports', req.ip)) return { status: 429 };
    const c = checkReport(req.body);
    if (!c.ok) return bad(c.reason);
    return { status: 200, body: { id: await d.store.addReport(c.value, d.now()) } };
  }

  // the operator's: the newest reports, and one whole (replay included)
  if (method === 'GET' && (path === '/v1/reports' || REPORT.test(path))) {
    if (!keyMatches(req.headers.authorization, d.adminKey)) return { status: 401 };
    if (path === '/v1/reports') return { status: 200, body: await d.store.reports(Math.min(200, Math.max(1, Number(req.query.get('limit')) || 50))) };
    const r = await d.store.report(path.slice('/v1/reports/'.length));
    return r ? { status: 200, body: r } : { status: 404 };
  }

  if (method === 'GET' && path === '/v1/stats') {
    if (!keyMatches(req.headers.authorization, d.adminKey)) return { status: 401 };
    const days = Math.min(90, Math.max(1, Number(req.query.get('days')) || 14));
    const host = req.query.get('host') || null;
    if (host !== null && !(HOSTS as readonly string[]).includes(host)) return bad('bad host');
    // the window's last day (UTC), for a past week or a single finished day; later than today means today
    const to = req.query.get('to') || undefined;
    if (to !== undefined && !isDay(to)) return bad('bad to');
    return { status: 200, body: await d.store.stats(days, d.now(), host as Host | null, to) };
  }

  return { status: 404 };
}

/** A token bucket per route and caller: `burst` requests at once, refilled at `perMinute`. */
export class Limiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly rates: Record<string, { burst: number; perMinute: number }>,
    private readonly now: () => number,
  ) {}

  allow(route: string, key: string): boolean {
    const rate = this.rates[route];
    if (!rate) return true;
    const id = `${route}/${key}`;
    const t = this.now();
    const b = this.buckets.get(id) ?? { tokens: rate.burst, at: t };
    b.tokens = Math.min(rate.burst, b.tokens + ((t - b.at) * rate.perMinute) / 60_000);
    b.at = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(id, b);
    // forget the full buckets now and then, so the map does not grow with every caller seen
    if (this.buckets.size > 50_000) for (const [k, v] of this.buckets) if (v.tokens >= this.rates[k.split('/')[0]].burst - 1) this.buckets.delete(k);
    return ok;
  }
}

export const RATES = {
  events: { burst: 20, perMinute: 30 },
  beacons: { burst: 10, perMinute: 20 },
  runs: { burst: 5, perMinute: 6 },
  boards: { burst: 20, perMinute: 30 },
  names: { burst: 5, perMinute: 4 },
  reports: { burst: 3, perMinute: 2 },
  challenge: { burst: 3, perMinute: 2 },
};

/** A real calendar day written YYYY-MM-DD. */
function isDay(s: string): boolean {
  const t = Date.parse(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(t) && new Date(t).toISOString().startsWith(s);
}
