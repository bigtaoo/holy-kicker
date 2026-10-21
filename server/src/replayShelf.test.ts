import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DiskShelf, KEEP_DAYS, MemoryShelf, wantsReplays, type StoredReplay } from './replayShelf';
import { route, tagOf, type Deps, type Req } from './routes';
import { MemoryStore } from './store';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const DAY = 24 * 3600_000;
const INSTALL = 'abcdefgh1234';
const replay = { engine: 44, config: { seed: 5, waves: 50 }, wave: 1, cmds: [1, 0, 16384, 255, 0], tick: 900, hash: 123456 };
const body = (over: object = {}) => ({ install: INSTALL, host: 'web', build: '0.0.1', locale: 'zh-CN', run: 'run0000001', end: 'lost', replay, ...over });
const ALL = { percent: 100, until: '2026-12-31' };

function deps(over: Partial<Deps> = {}): Deps & { replays: MemoryShelf } {
  return { store: new MemoryStore(), tagSalt: 'salt', adminKey: 'key', now: () => NOW, allow: () => true, resim: { push() {} }, replays: new MemoryShelf(), collect: ALL, ...over } as Deps & { replays: MemoryShelf };
}

function req(method: string, path: string, b?: unknown, headers: Record<string, string> = {}): Req {
  const [pathname, query = ''] = path.split('?');
  return { method, path: pathname, query: new URLSearchParams(query), headers, body: b, ip: '1.2.3.4' };
}

describe('which installs send their replays', () => {
  it('asks a share of installs, and nobody after the last day', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `install${String(i).padStart(5, '0')}`);
    const asked = ids.filter((id) => wantsReplays(id, NOW, { percent: 25, until: '2026-12-31' })).length;
    expect(asked).toBeGreaterThan(60);
    expect(asked).toBeLessThan(140);
    expect(ids.every((id) => wantsReplays(id, NOW, ALL))).toBe(true);
    expect(ids.some((id) => wantsReplays(id, NOW, { percent: 0, until: '2026-12-31' }))).toBe(false);
    expect(wantsReplays(INSTALL, Date.parse('2026-12-31T23:59:00Z'), ALL)).toBe(true);
    expect(wantsReplays(INSTALL, Date.parse('2027-01-01T00:00:00Z'), ALL)).toBe(false);
  });
});

describe('collected replays over the API', () => {
  it('tells an install whether it is asked', async () => {
    const d = deps();
    expect((await route(req('GET', '/v1/replays/wanted', undefined, { 'x-hk-install': INSTALL }), d)).body).toEqual({ want: true });
    expect((await route(req('GET', '/v1/replays/wanted'), d)).body).toEqual({ want: false });
    expect((await route(req('GET', '/v1/replays/wanted', undefined, { 'x-hk-install': INSTALL }), deps({ replays: undefined }))).body).toEqual({ want: false });
  });

  it('keeps a run under the install tag and its id, the later send over the earlier', async () => {
    const d = deps();
    expect((await route(req('POST', '/v1/replays', body({ end: 'hidden' })), d)).status).toBe(204);
    expect((await route(req('POST', '/v1/replays', body({ replay: { ...replay, tick: 1800 } })), d)).status).toBe(204);
    const name = `${tagOf(INSTALL, 'salt')}-run0000001`;
    expect([...d.replays.docs.keys()]).toEqual([name]);
    const doc = d.replays.docs.get(name)!;
    expect(doc).toMatchObject({ end: 'lost', at: NOW, host: 'web', replay: { tick: 1800 } });
    expect(JSON.stringify(doc)).not.toContain(INSTALL);
  });

  it('refuses one it did not ask for, and a broken one', async () => {
    expect((await route(req('POST', '/v1/replays', body()), deps({ collect: { percent: 0, until: '2026-12-31' } }))).status).toBe(403);
    expect((await route(req('POST', '/v1/replays', body({ end: 'paused' })), deps())).status).toBe(400);
    expect((await route(req('POST', '/v1/replays', body({ run: 'x' })), deps())).status).toBe(400);
    expect((await route(req('POST', '/v1/replays', body({ replay: { ...replay, cmds: [1, 2] } })), deps())).status).toBe(400);
  });

  it('lists and hands them to the operator only', async () => {
    const d = deps();
    await route(req('POST', '/v1/replays', body()), d);
    const name = `${tagOf(INSTALL, 'salt')}-run0000001`;
    expect((await route(req('GET', '/v1/replays'), d)).status).toBe(401);
    const auth = { authorization: 'Bearer key' };
    expect((await route(req('GET', '/v1/replays', undefined, auth), d)).body).toMatchObject([{ name, at: NOW }]);
    expect((await route(req('GET', `/v1/replays/${name}`, undefined, auth), d)).body).toMatchObject({ end: 'lost', replay });
    expect((await route(req('GET', '/v1/replays/../etc', undefined, auth), d)).status).toBe(404);
  });
});

describe('the disk shelf', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hk-shelf-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const doc = (at: number): StoredReplay => ({ tag: 'abcdefghij', host: 'web', build: '1', locale: 'en', end: 'won', at, replay });

  it('keeps, reopens, lists newest first, prunes the old and stops when full', async () => {
    const shelf = await DiskShelf.open(dir);
    expect(await shelf.put('abcdefghij-run0000001', doc(NOW - (KEEP_DAYS + 1) * DAY))).toBe(true);
    expect(await shelf.put('abcdefghij-run0000002', doc(NOW))).toBe(true);
    const again = await DiskShelf.open(dir);
    expect((await again.list(10)).map((e) => e.name)).toEqual(['abcdefghij-run0000002', 'abcdefghij-run0000001']);
    expect(await again.get('abcdefghij-run0000002')).toEqual(doc(NOW));
    expect(await again.get('abcdefghij-run0000003')).toBeNull();
    expect(await again.prune(NOW)).toBe(1);
    expect((await again.list(10)).map((e) => e.name)).toEqual(['abcdefghij-run0000002']);
    const tiny = await DiskShelf.open(dir, 10);
    expect(await tiny.put('abcdefghij-run0000004', doc(NOW))).toBe(false);
  });
});
