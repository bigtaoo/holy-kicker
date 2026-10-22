import { describe, expect, it } from 'vitest';
import { CHALLENGE_BOARD, boardId, challengeBoardId, type RunEntry } from './protocol';
import { route, type Deps, type Req } from './routes';
import { checkBatch, checkReport, checkRun } from './rules';
import { MemoryStore, type ResimRef } from './store';

// One backend for Holy Kicker and its corgi reskin (game.ts): each game's numbers and boards apart.

const NOW = Date.parse('2026-10-05T12:00:00Z');
const MONK = 'abcdefgh1234';
const CORGI = 'corgi0000001';

// a board run's re-simulation passes at once (board.test.ts checks the real thing)
function deps(): Deps & { store: MemoryStore } {
  const store = new MemoryStore();
  const resim = { push: (r: ResimRef) => void store.settleBoardRun(r.board, r.tag, r.at, true) };
  return { store, tagSalt: 'salt', adminKey: 'key', now: () => NOW, allow: () => true, resim, boardReplay: (_r, p) => p } as Deps & { store: MemoryStore };
}

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Req {
  const [pathname, query = ''] = path.split('?');
  return { method, path: pathname, query: new URLSearchParams(query), headers, body, ip: '1.2.3.4' };
}

const batch = (over: object = {}) => ({
  install: MONK, session: 'session01', host: 'web', build: '0.0.1', locale: 'en',
  events: [{ e: 'run_start', t: NOW - 1000, p: { chapter: 1, hard: false } }], ...over,
});

const run = (over: Partial<RunEntry> = {}): RunEntry => ({
  install: MONK, host: 'web', build: '0.0.1', chapter: 1, hard: false, won: false, wave: 20,
  tenths: 3000, level: 12, kills: 900, monk: 'kicker', relic: 'ball', ...over,
});

const replay = { engine: 1, config: {}, wave: 1, cmds: [], tick: 0, hash: 0 };
const post = (over: Partial<RunEntry> = {}) => ({ ...run(over), replay });

const admin = { authorization: 'Bearer key' };

describe('games', () => {
  it('name their boards apart, the first game as before', () => {
    expect(boardId(3, true)).toBe('c3h');
    expect(boardId(3, true, 'monk')).toBe('c3h');
    expect(boardId(3, false, 'corgi')).toBe('c3-corgi');
    expect(challengeBoardId('w2026-43', 39, 1, 'corgi')).toBe('w2026-43-e39-c1-corgi');
    expect(CHALLENGE_BOARD.test('w2026-43-e39-c1-corgi')).toBe(true);
    expect(CHALLENGE_BOARD.test('w2026-43-e39-c1')).toBe(true);
    expect(CHALLENGE_BOARD.test('w2026-43-e39-c1-dog')).toBe(false);
  });

  it('keep the corgi tag, drop the first game\'s and refuse an unknown one', () => {
    expect(checkBatch(batch({ game: 'corgi' }), NOW)).toMatchObject({ ok: true, value: { game: 'corgi' } });
    const monk = checkBatch(batch({ game: 'monk' }), NOW);
    expect(monk.ok && monk.value).not.toHaveProperty('game');
    expect(checkBatch(batch({ game: 'dog' }), NOW)).toMatchObject({ ok: false, reason: 'bad game' });
    expect(checkRun(run({ game: 'corgi' }))).toMatchObject({ ok: true, value: { game: 'corgi' } });
    expect(checkRun({ ...run(), game: 7 } as unknown as RunEntry)).toMatchObject({ ok: false, reason: 'bad game' });
    const report = { install: MONK, host: 'web', build: '0.0.1', locale: 'de', text: 'Stuck', device: 'Mozilla/5.0', chapter: 1, wave: 12 };
    expect(checkReport({ ...report, game: 'dog' })).toMatchObject({ ok: false, reason: 'bad game' });
  });

  it('rank each game\'s runs on its own boards', async () => {
    const d = deps();
    expect((await route(req('POST', '/v1/runs', post()), d)).body).toMatchObject({ board: 'c1', rank: 1 });
    expect((await route(req('POST', '/v1/runs', post({ install: CORGI, game: 'corgi', wave: 40 })), d)).body).toMatchObject({ board: 'c1-corgi', rank: 1 });
    const monk = (await route(req('GET', '/v1/boards/c1'), d)).body as { total: number; rows: { wave: number }[] };
    expect(monk.total).toBe(1);
    expect(monk.rows[0].wave).toBe(20);
    expect(((await route(req('GET', '/v1/boards/c1-corgi'), d)).body as { total: number }).total).toBe(1);
    expect((await route(req('GET', '/v1/boards/c1-dog'), d)).status).toBe(400);
  });

  it('count each game\'s players and load checkpoints apart', async () => {
    const d = deps();
    await route(req('POST', '/v1/events', batch()), d);
    await route(req('POST', '/v1/events', batch({ install: CORGI, game: 'corgi' })), d);
    await route(req('POST', '/v1/events', batch({ install: 'corgi0000002', game: 'corgi' })), d);
    for (const g of ['', '&g=corgi', '&g=corgi', '&g=monk']) {
      expect((await route(req('GET', `/v1/beacon?h=web&s=open_touch&b=abc1234${g}`), d)).status).toBe(204);
    }
    expect((await route(req('GET', '/v1/beacon?h=web&s=open_touch&b=abc1234&g=dog'), d)).status).toBe(400);
    const stats = async (q: string) => (await route(req('GET', `/v1/stats?days=1${q}`, undefined, admin), d)).body as { game: string; days: { fresh: number }[]; beacons: { n: number }[] };
    const monk = await stats('');
    expect(monk.game).toBe('monk');
    expect(monk.days.at(-1)!.fresh).toBe(1);
    expect(monk.beacons).toEqual([expect.objectContaining({ n: 2 })]);
    const corgi = await stats('&game=corgi');
    expect(corgi.game).toBe('corgi');
    expect(corgi.days.at(-1)!.fresh).toBe(2);
    expect(corgi.beacons).toEqual([expect.objectContaining({ n: 2 })]);
    expect((await route(req('GET', '/v1/stats?game=dog', undefined, admin), d)).status).toBe(400);
  });
});
