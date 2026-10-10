import { describe, expect, it } from 'vitest';
import { DICE, LIMITS, checkName, packDice, rollDice, runScore, unpackDice, type RunEntry } from './protocol';
import { Limiter, route, tagOf, type Deps, type Req } from './routes';
import { checkBatch, checkReport, checkRun } from './rules';
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

const replay = { engine: 31, config: { seed: 5, waves: 50 }, wave: 1, cmds: [1, 0, 16384, 255, 0, 31, 0, 0, 0, 6], tick: 900, hash: 123456 };
const report = (over: object = {}) => ({
  install: INSTALL, host: 'web', build: '0.0.1', locale: 'de', text: 'The boss got stuck', device: 'Mozilla/5.0', chapter: 1, wave: 12, replay, ...over,
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

  it('keeps who a new install is from the request, once', async () => {
    const d = deps();
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
    await route(req('POST', '/v1/events', batch(), { 'user-agent': ua, 'cf-ipcountry': 'EG' }), d);
    await route(req('POST', '/v1/events', batch(), { 'cf-ipcountry': 'DE' }), d);
    expect(d.store.players.get(INSTALL)!.aud).toEqual({ device: 'mobile', browser: 'Chrome', os: 'Android', country: 'EG' });
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

  it('shows portal names from CrazyGames and dice names from everyone', async () => {
    const d = deps();
    const dice = packDice(3, 7, 42);
    await route(req('POST', '/v1/runs', run()), d);
    await route(req('POST', '/v1/runs', run({ install: 'zzzzzzzz9999', wave: 30, tenths: 5000, name: 'kicker42' })), d);
    expect((await route(req('POST', '/v1/name', { install: INSTALL, host: 'web', dice }), d)).body).toEqual({ ok: true });
    // only a portal with accounts names players in text, and a dice name has to be one
    expect((await route(req('POST', '/v1/name', { install: INSTALL, host: 'web', name: 'Iron Head' }), d)).status).toBe(400);
    expect((await route(req('POST', '/v1/name', { install: INSTALL, host: 'web', dice: 0 }), d)).status).toBe(400);
    expect((await route(req('POST', '/v1/name', { install: INSTALL, host: 'crazygames', name: 'Sh1t head' }), d)).status).toBe(400);
    // a run whose name is refused still counts, under the name kept before
    expect((await route(req('POST', '/v1/runs', run({ wave: 25, tenths: 4000, host: 'poki', name: 'Iron Head' })), d)).status).toBe(200);
    const b = (await route(req('GET', '/v1/boards/c1', undefined, { 'x-hk-install': INSTALL }), d)).body as { rows: { name: string; dice: number }[]; mine: { dice: number } };
    expect(b.rows.map((r) => [r.name, r.dice])).toEqual([['kicker42', 0], ['', dice]]);
    expect(b.mine.dice).toBe(dice);
    // signing in to the portal later swaps the dice name for the account's
    await route(req('POST', '/v1/name', { install: INSTALL, host: 'crazygames', name: 'IronHead' }), d);
    expect(((await route(req('GET', '/v1/boards/c1'), d)).body as { rows: { name: string; dice: number }[] }).rows[1]).toMatchObject({ name: 'IronHead', dice: 0 });
    // and so does Game Center's nickname on iOS
    expect((await route(req('POST', '/v1/name', { install: INSTALL, host: 'ios', name: 'Sh1t head' }), d)).status).toBe(400);
    await route(req('POST', '/v1/name', { install: INSTALL, host: 'ios', name: 'KickerGC' }), d);
    expect(((await route(req('GET', '/v1/boards/c1'), d)).body as { rows: { name: string }[] }).rows[1].name).toBe('KickerGC');
    expect((await route(req('POST', '/v1/name', { install: INSTALL, host: 'web', dice }), deps({ allow: () => false }))).status).toBe(429);
  });

  it('packs every dice name into one integer and back', () => {
    expect(unpackDice(packDice(15, 15, DICE.numMax))).toEqual({ adj: 15, noun: 15, num: DICE.numMax });
    expect(unpackDice(packDice(0, 0, DICE.numMin))).toEqual({ adj: 0, noun: 0, num: DICE.numMin });
    expect(unpackDice(packDice(15, 15, DICE.numMax) + 1)).toBeNull();
    expect(unpackDice(rollDice(() => 0.9999999))).toEqual({ adj: 15, noun: 15, num: DICE.numMax });
    expect(unpackDice(rollDice(() => 0))).toEqual({ adj: 0, noun: 0, num: DICE.numMin });
  });

  it('takes portal names in any script and refuses rude or staff ones however spelt', () => {
    for (const ok of ['小和尚', 'Kicker Monk', 'Сергей_7', '김민수', 'glass', 'Computer', 'Rick Tracy', 'Shotgun', 'Slot 2024', 'Bob 1987']) expect(checkName(ok)).toMatchObject({ ok: true });
    expect(checkName('a')).toEqual({ ok: false, why: 'length' });
    expect(checkName('x'.repeat(LIMITS.nameMax + 1))).toEqual({ ok: false, why: 'length' });
    expect(checkName('<b>hi</b>')).toEqual({ ok: false, why: 'chars' });
    expect(checkName('😀😀')).toEqual({ ok: false, why: 'chars' });
    for (const rude of ['F u c k', 'F4ck off', 'sh1t', 'b1tch', '5lut', 'f4ggot', 'a55', 'D1ck', 'big ass', '傻逼玩家', 'Admin', 'ＡＤＭＩＮ', 'kurwa_mac']) expect(checkName(rude)).toEqual({ ok: false, why: 'rude' });
  });

  it('guards the stats with the admin key and limits each caller', async () => {
    expect((await route(req('GET', '/v1/stats'), deps())).status).toBe(401);
    expect((await route(req('GET', '/v1/stats', undefined, { authorization: 'Bearer nope' }), deps())).status).toBe(401);
    expect((await route(req('GET', '/v1/stats?days=7', undefined, { authorization: 'Bearer key' }), deps())).status).toBe(200);
    expect((await route(req('GET', '/v1/stats?host=poki', undefined, { authorization: 'Bearer key' }), deps())).status).toBe(200);
    expect((await route(req('GET', '/v1/stats?host=steam', undefined, { authorization: 'Bearer key' }), deps())).status).toBe(400);
    expect((await route(req('GET', '/v1/stats', undefined, { authorization: 'Bearer key' }), deps({ adminKey: '' }))).status).toBe(401);
    expect((await route(req('POST', '/v1/runs', run()), deps({ allow: () => false }))).status).toBe(429);
    expect((await route(req('GET', '/nope'), deps())).status).toBe(404);
  });

  it('keeps a problem report with its replay, for the operator only', async () => {
    const d = deps();
    const sent = await route(req('POST', '/v1/reports', report()), d);
    expect(sent.status).toBe(200);
    const id = (sent.body as { id: string }).id;
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect((await route(req('GET', '/v1/reports'), d)).status).toBe(401);
    const list = await route(req('GET', '/v1/reports', undefined, { authorization: 'Bearer key' }), d);
    expect(list.body).toEqual([expect.objectContaining({ id, text: 'The boss got stuck', ticks: 900 })]);
    expect((list.body as object[])[0]).not.toHaveProperty('replay');
    const one = await route(req('GET', `/v1/reports/${id}`, undefined, { authorization: 'Bearer key' }), d);
    expect((one.body as { replay: { cmds: number[] } }).replay.cmds).toEqual(replay.cmds);
    expect((await route(req('GET', '/v1/reports/0123456789abcdef', undefined, { authorization: 'Bearer key' }), d)).status).toBe(404);
    expect((await route(req('POST', '/v1/reports', report()), deps({ allow: () => false }))).status).toBe(429);
  });

  it('refuses a broken report', () => {
    expect(checkReport(report()).ok).toBe(true);
    expect(checkReport(report({ replay: null, text: '' })).ok).toBe(true);
    expect(checkReport(report({ text: 'x'.repeat(LIMITS.reportText + 1) })).ok).toBe(false);
    expect(checkReport(report({ replay: { ...replay, cmds: [1, 2, 3] } })).ok).toBe(false);
    expect(checkReport(report({ replay: { ...replay, cmds: [1, 0, 0.5, 0, 0] } })).ok).toBe(false);
    expect(checkReport(report({ replay: { ...replay, config: 'x' } })).ok).toBe(false);
  });

  it('lists the newest reports first, as many as asked for', async () => {
    let t = NOW;
    const d = deps({ now: () => t++ });
    for (const text of ['a', 'b', 'c']) await route(req('POST', '/v1/reports', report({ text })), d);
    const admin = { authorization: 'Bearer key' };
    const list = async (q: string) => ((await route(req('GET', `/v1/reports${q}`, undefined, admin), d)).body as { text: string; at: number }[]);
    expect((await list('')).map((r) => r.text)).toEqual(['c', 'b', 'a']);
    expect((await list('?limit=2')).map((r) => r.text)).toEqual(['c', 'b']);
    // a nonsense limit falls back to the default rather than to nothing
    expect(await list('?limit=0')).toHaveLength(3);
    expect((await list(''))[0].at).toBe(NOW + 2);
  });

  it('takes the longest replay a client sends inside the body limit', () => {
    // the client drops a replay past replayNumbers; four hours of a stick turning every tick
    const cmds: number[] = [];
    for (let i = 0; cmds.length < LIMITS.replayNumbers; i++) cmds.push(LIMITS.maxSeconds * 30 - i, 0, 65535 - (i % 9), 255, 2 + 4 * 3);
    const big = report({ text: 'x'.repeat(LIMITS.reportText), device: 'd'.repeat(LIMITS.device), replay: { ...replay, cmds } });
    expect(checkReport(big).ok).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(big))).toBeLessThan(LIMITS.reportBytes);
    expect(checkReport(report({ replay: { ...replay, cmds: [...cmds, 1, 0, 0, 0, 0] } })).ok).toBe(false);
  });

  it('refuses a report missing what an operator needs to read it', () => {
    expect(checkReport(report({ device: 'd'.repeat(LIMITS.device + 1) })).ok).toBe(false);
    expect(checkReport(report({ chapter: LIMITS.chapters + 1 })).ok).toBe(false);
    expect(checkReport(report({ wave: LIMITS.waves + 1 })).ok).toBe(false);
    expect(checkReport(report({ install: 'short' })).ok).toBe(false);
    expect(checkReport(report({ replay: { ...replay, tick: -1 } })).ok).toBe(false);
    expect(checkReport(report({ replay: { ...replay, config: { pad: 'x'.repeat(LIMITS.replayConfig) } } })).ok).toBe(false);
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
