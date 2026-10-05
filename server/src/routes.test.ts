import { describe, expect, it } from 'vitest';
import { LIMITS, runScore, type RunEntry } from './protocol';
import { Limiter, route, tagOf, type Deps, type Req } from './routes';
import { checkBatch, checkRun } from './rules';
import { MemoryStore } from './store';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const INSTALL = 'abcdefgh1234';

function deps(over: Partial<Deps> = {}): Deps & { store: MemoryStore } {
  return { store: new MemoryStore(), tagSalt: 'salt', adminKey: 'key', now: () => NOW, allow: () => true, ...over } as Deps & { store: MemoryStore };
}

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Req {
  const [pathname, query = ''] = path.split('?');
  return { method, path: pathname, query: new URLSearchParams(query), headers, body, ip: '1.2.3.4' };
}

const batch = (over: object = {}) => ({
  install: INSTALL, session: 'session01', host: 'web', build: '0.0.1', locale: 'zh-CN',
  events: [{ e: 'run_start', t: NOW - 1000, p: { chapter: 2, hard: false } }], ...over,
});

const run = (over: Partial<RunEntry> = {}): RunEntry => ({
  install: INSTALL, host: 'crazygames', build: '0.0.1', chapter: 1, hard: false, won: false, wave: 20,
  tenths: 3000, level: 12, kills: 900, monk: 'kicker', relic: 'ball', ...over,
});

describe('checks', () => {
  it('take a good batch and refuse a bad one whole', () => {
    expect(checkBatch(batch(), NOW).ok).toBe(true);
    expect(checkBatch(batch({ install: 'short' }), NOW).ok).toBe(false);
    expect(checkBatch(batch({ host: 'steam' }), NOW).ok).toBe(false);
    expect(checkBatch(batch({ events: [] }), NOW).ok).toBe(false);
    expect(checkBatch(batch({ events: [{ e: 'hack', t: NOW }] }), NOW).ok).toBe(false);
    expect(checkBatch(batch({ events: [{ e: 'session', t: NOW - LIMITS.late - 1 }] }), NOW).ok).toBe(false);
    expect(checkBatch(batch({ events: [{ e: 'session', t: NOW, p: { x: { y: 1 } } }] }), NOW).ok).toBe(false);
    expect(checkBatch(batch({ events: Array.from({ length: LIMITS.batchEvents + 1 }, () => ({ e: 'session', t: NOW })) }), NOW).ok).toBe(false);
  });

  it('refuse a run that could not have happened', () => {
    expect(checkRun(run()).ok).toBe(true);
    expect(checkRun(run({ won: true, wave: LIMITS.waves, tenths: 8000 })).ok).toBe(true);
    expect(checkRun(run({ won: true, wave: 30 })).ok).toBe(false);
    expect(checkRun(run({ wave: 20, tenths: 20 * LIMITS.minSecondsPerWave * 10 - 1 })).ok).toBe(false);
    expect(checkRun(run({ chapter: LIMITS.chapters + 1 })).ok).toBe(false);
    expect(checkRun(run({ level: 0 })).ok).toBe(false);
  });

  it('rank a win over any loss, then waves, then the faster time', () => {
    expect(runScore({ won: true, wave: 50, tenths: 9000 })).toBeGreaterThan(runScore({ won: false, wave: 50, tenths: 100 }));
    expect(runScore({ won: false, wave: 21, tenths: 9000 })).toBeGreaterThan(runScore({ won: false, wave: 20, tenths: 100 }));
    expect(runScore({ won: true, wave: 50, tenths: 7000 })).toBeGreaterThan(runScore({ won: true, wave: 50, tenths: 7001 }));
  });
});

describe('routes', () => {
  it('keeps a checked batch and refuses the rest', async () => {
    const d = deps();
    expect((await route(req('POST', '/v1/events', batch()), d)).status).toBe(204);
    expect((await route(req('POST', '/v1/events', batch({ host: 'x' })), d)).status).toBe(400);
    expect(d.store.events.length).toBe(1);
    expect(d.store.events[0].at).toBe(NOW);
  });

  it('keeps each install\'s best run per board and ranks it', async () => {
    const d = deps();
    const first = await route(req('POST', '/v1/runs', run()), d);
    expect(first.body).toMatchObject({ board: 'c1', rank: 1, best: true, tag: tagOf(INSTALL, 'salt') });
    // a worse run does not replace it, a better one from someone else goes above
    expect((await route(req('POST', '/v1/runs', run({ wave: 10, tenths: 1000 })), d)).body).toMatchObject({ best: false, rank: 1 });
    await route(req('POST', '/v1/runs', run({ install: 'zzzzzzzz9999', wave: 30, tenths: 5000 })), d);
    await route(req('POST', '/v1/runs', run({ hard: true })), d);
    const b = await route(req('GET', '/v1/boards/c1', undefined, { 'x-hk-install': INSTALL }), d);
    const body = b.body as { total: number; rows: { wave: number; tag: string }[]; mine: { rank: number } };
    expect(body.total).toBe(2);
    expect(body.rows.map((r) => r.wave)).toEqual([30, 20]);
    expect(body.mine.rank).toBe(2);
    // the install id itself never goes out
    expect(JSON.stringify(b.body)).not.toContain(INSTALL);
    expect(((await route(req('GET', '/v1/boards/c1h'), d)).body as { total: number }).total).toBe(1);
    expect((await route(req('GET', '/v1/boards/c9'), d)).status).toBe(400);
  });

  it('guards the stats with the admin key and limits each caller', async () => {
    expect((await route(req('GET', '/v1/stats'), deps())).status).toBe(401);
    expect((await route(req('GET', '/v1/stats', undefined, { authorization: 'Bearer nope' }), deps())).status).toBe(401);
    expect((await route(req('GET', '/v1/stats?days=7', undefined, { authorization: 'Bearer key' }), deps())).status).toBe(200);
    expect((await route(req('GET', '/v1/stats', undefined, { authorization: 'Bearer key' }), deps({ adminKey: '' }))).status).toBe(401);
    expect((await route(req('POST', '/v1/runs', run()), deps({ allow: () => false }))).status).toBe(429);
    expect((await route(req('GET', '/nope'), deps())).status).toBe(404);
  });

  it('refills each caller\'s bucket over time', () => {
    let t = 0;
    const l = new Limiter({ runs: { burst: 2, perMinute: 6 } }, () => t);
    expect([l.allow('runs', 'a'), l.allow('runs', 'a'), l.allow('runs', 'a')]).toEqual([true, true, false]);
    expect(l.allow('runs', 'b')).toBe(true);
    t += 10_000;
    expect(l.allow('runs', 'a')).toBe(true);
    expect(l.allow('runs', 'a')).toBe(false);
    expect(l.allow('other', 'a')).toBe(true);
  });
});
