import { createHmac, timingSafeEqual } from 'node:crypto';
import { audienceOf } from './audience';
import { HOSTS, LIMITS, type Host } from './protocol';
import { checkBatch, checkNameEntry, checkReport, checkRun } from './rules';
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
}

export const BOARD_ROWS = 50;
const BOARD = /^c[1-9]h?$/;
const REPORT = /^\/v1\/reports\/[0-9a-f]{16}$/;

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
    const install = req.headers['x-hk-install'];
    const tag = install && install.length >= LIMITS.idMin && install.length <= LIMITS.idMax ? tagOf(install, d.tagSalt) : null;
    return { status: 200, body: await d.store.board(board, BOARD_ROWS, tag) };
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
    return { status: 200, body: await d.store.stats(days, d.now(), host as Host | null) };
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
  runs: { burst: 5, perMinute: 6 },
  boards: { burst: 20, perMinute: 30 },
  names: { burst: 5, perMinute: 4 },
  reports: { burst: 3, perMinute: 2 },
};
