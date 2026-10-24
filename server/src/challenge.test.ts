import { engineFor } from './engines';
import { ENGINE_VERSION, MUTATOR_IDS } from '@hk/engine';
import { describe, expect, it } from 'vitest';
import { challengeFor, DAILY_WAVES, dailyOf, dailySeed, misfit, weeklyOf, ymdOf, DAY_MS, LATE_MS } from './challenge';
import { RESIM_TOP, challengeBoardId, topPercent, type ChallengeBoardReply, type ChallengeList, type ChallengeRunReply, type ReplayWire, type RunEntry } from './protocol';
import { rankedConfig, resimulate } from './resim';
import { ResimQueue } from './resimQueue';
import { route, type Deps, type Req } from './routes';
import { checkChallengeRun } from './rules';
import { MemoryStore, type ChallengeEntry } from './store';
import { INSTALL, playRun } from './testPlay';

const NOW = Date.parse('2026-10-18T09:30:00Z');

const DAILY = dailyOf(NOW);
const PLAYED = playRun(DAILY);

describe('the daily', () => {
  it('is a formula of the UTC day', () => {
    expect(DAILY).toMatchObject({ id: 'd20261018', kind: 'daily', start: Date.parse('2026-10-18T00:00:00Z'), end: Date.parse('2026-10-19T00:00:00Z'), chapter: 'furthest', engine: ENGINE_VERSION });
    expect(dailyOf(DAILY.start)).toEqual(DAILY);
    expect(dailyOf(DAILY.end - 1)).toEqual(DAILY);
    expect(dailyOf(DAILY.end).id).toBe('d20261019');
    expect(ymdOf(Date.parse('2027-01-01T00:00:00Z'))).toBe(20270101);
  });

  it('has a different seed every day, in the engine seed range', () => {
    const seeds = new Set<number>();
    for (let d = 0; d < 400; d++) seeds.add(dailyOf(NOW + d * DAY_MS).seed);
    expect(seeds.size).toBe(400);
    for (const s of seeds) expect(s >= 1 && s <= 0x7ffffffe).toBe(true);
    expect(dailySeed(20261018)).toBe(DAILY.seed);
  });

  it('ends on wave 20 with a mutator that turns every day', () => {
    expect(DAILY_WAVES).toBe(20);
    expect(DAILY.waves).toBe(20);
    const week = Array.from({ length: 7 }, (_, d) => dailyOf(NOW + d * DAY_MS).mutator);
    expect(new Set(week)).toEqual(new Set(MUTATOR_IDS));
    for (let d = 0; d < 6; d++) expect(week[d + 1]).not.toBe(week[d]);
    expect(PLAYED.replay.config.mutator).toBe(DAILY.mutator);
  });

  it('takes runs until a little after it closed', () => {
    expect(challengeFor(DAILY.id, NOW)?.id).toBe(DAILY.id);
    expect(challengeFor(DAILY.id, DAILY.end + LATE_MS - 1)?.id).toBe(DAILY.id);
    expect(challengeFor(DAILY.id, DAILY.end + LATE_MS)).toBeNull();
    expect(challengeFor('d20261019', NOW)).toBeNull();
    expect(challengeFor('x', NOW)).toBeNull();
  });

  it('refuses a run that was not played on it', () => {
    const { run, replay } = PLAYED;
    expect(misfit(DAILY, run, replay)).toBeNull();
    expect(misfit(DAILY, run, { ...replay, engine: replay.engine - 1 })).toBe('engine');
    expect(misfit(DAILY, run, { ...replay, config: { ...replay.config, seed: 7 } })).toBe('seed');
    expect(misfit(DAILY, run, { ...replay, config: { ...replay.config, mutator: null } })).toBe('mutator');
    expect(misfit({ ...DAILY, mutator: null }, run, { ...replay, config: { ...replay.config, mutator: undefined } })).not.toBe('mutator');
    expect(misfit(DAILY, run, { ...replay, config: { ...replay.config, revives: 1 } })).toBe('revives');
    expect(misfit(DAILY, run, { ...replay, wave: 20 })).toBe('waves');
    expect(misfit(DAILY, { ...run, chapter: 2 }, replay)).toBe('chapter');
    expect(misfit(DAILY, { ...run, relic: 'staff' }, replay)).toBe('loadout');
    // a daily is won on its own last wave (the mid-boss of 20), not the chapter's 50
    expect(misfit(DAILY, { ...run, won: true, wave: DAILY_WAVES }, replay)).toBeNull();
    expect(misfit(DAILY, { ...run, won: true, wave: DAILY_WAVES - 1 }, replay)).toBe('waves');
    expect(checkChallengeRun({ challenge: DAILY.id, run: { ...run, won: true, wave: DAILY_WAVES, tenths: 3000 }, replay }).ok).toBe(true);
  });

  it('shows a rank as the top share of the board', () => {
    expect(topPercent(1, 1)).toBe(100);
    expect(topPercent(1, 1000)).toBe(1);
    expect(topPercent(37, 200)).toBe(19);
    expect(topPercent(0, 0)).toBe(100);
  });
});

describe('re-simulation', () => {
  it('passes a real run and gives its pick timeline', () => {
    const v = resimulate(PLAYED.replay, PLAYED.run);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.picks.length).toBeGreaterThan(2);
    for (const p of v.picks) {
      expect(p.offered.length).toBeGreaterThan(0);
      expect(p.took).toBeGreaterThanOrEqual(0);
      expect(p.offered[p.took]).toMatch(/^(relic|spell|passive|shrine|evolve):/);
    }
    expect(v.picks[0].wave).toBe(1);
  });

  it('refuses a forged hash, outcome, level or config', () => {
    const { run, replay } = PLAYED;
    expect(resimulate({ ...replay, hash: replay.hash ^ 1 }, run)).toEqual({ ok: false, why: 'hash' });
    expect(resimulate(replay, { ...run, wave: run.wave + 1 })).toEqual({ ok: false, why: 'outcome' });
    expect(resimulate(replay, { ...run, level: run.level + 1 })).toEqual({ ok: false, why: 'stats' });
    expect(resimulate(replay, run, null)).toEqual({ ok: false, why: 'engine' });
    const cmds = [...replay.cmds];
    cmds[cmds.length - 3] ^= 0x4000;
    expect(resimulate({ ...replay, cmds }, run).ok).toBe(false);
  });

  it('takes only a config a ranked run could have', () => {
    const c = PLAYED.replay.config;
    expect(rankedConfig(c)).not.toBeNull();
    expect(rankedConfig({ ...c, mobs: 300 })).toBeNull();
    expect(rankedConfig({ ...c, spells: ['nova'] })).toBeNull();
    expect(rankedConfig({ ...c, sutras: ['lotus', 'lotus'] })).toBeNull();
    expect(rankedConfig({ ...c, bonus: { attack: 1.5 } })).toBeNull();
    expect(rankedConfig({ ...c, bonus: { wings: 5 } })).toBeNull();
    expect(rankedConfig({ ...c, relic: 'sword' })).toBeNull();
    expect(rankedConfig({ ...c, mutator: 'chaos' })).toBeNull();
    expect(rankedConfig({ ...c, mutator: undefined })?.mutator).toBeNull();
    expect(rankedConfig(c)?.mutator).toBe(DAILY.mutator);
    expect(rankedConfig({ ...c, bonus: { attack: 40, maxHp: 120 }, sutras: ['halo'], relic: 'bowl', monk: 'fat' })).not.toBeNull();
  });
});

function setup(now = NOW) {
  const store = new MemoryStore();
  const logs: string[] = [];
  const resim = new ResimQueue(store, engineFor, () => now, (l) => logs.push(l), (fn) => setTimeout(fn, 0));
  const deps: Deps = { store, tagSalt: 'salt', adminKey: 'key', now: () => now, allow: () => true, resim };
  return { store, resim, deps, logs };
}

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Req {
  return { method, path, query: new URLSearchParams(), headers, body, ip: '1.2.3.4' };
}

const send = (d: Deps, played: { run: RunEntry; replay: ReplayWire }, challenge = DAILY.id) =>
  route(req('POST', '/v1/challenge/runs', { challenge, ...played }), d);

describe('challenge routes', () => {
  it('list the open daily and weekly with the server clock', async () => {
    const { deps } = setup();
    const r = await route(req('GET', '/v1/challenge'), deps);
    const body = r.body as ChallengeList;
    expect(body.now).toBe(NOW);
    expect(body.challenges).toEqual([DAILY, weeklyOf(NOW)]);
  });

  it('keep a top run pending until re-simulated, then put it on the board', async () => {
    const { deps, resim, store } = setup();
    const r = await send(deps, PLAYED);
    expect(r.status).toBe(200);
    const reply = r.body as ChallengeRunReply;
    const board = challengeBoardId(DAILY.id, ENGINE_VERSION, 1);
    expect(reply).toMatchObject({ board, status: 'pending', rank: 1, total: 1 });
    const before = (await route(req('GET', `/v1/challenge/boards/${board}`, undefined, { 'x-hk-install': INSTALL }), deps)).body as ChallengeBoardReply;
    expect(before.rows).toEqual([]);
    expect(before.pending).toBe(true);
    expect(before.mine?.rank).toBe(1);
    await resim.idle();
    const after = (await route(req('GET', `/v1/challenge/boards/${board}`, undefined, { 'x-hk-install': INSTALL }), deps)).body as ChallengeBoardReply;
    expect(after.rows.length).toBe(1);
    expect(after.pending).toBe(false);
    expect(after.mine).toMatchObject({ rank: 1, wave: PLAYED.run.wave });
    const doc = [...store.challenges.values()][0];
    expect(doc.verified).toBe(true);
    expect(doc.picks!.length).toBeGreaterThan(2);
    // a daily keeps no replay once verified
    expect(doc.replay).toBeUndefined();
  });

  it('count the first run of the day and answer a second with its rank', async () => {
    const { deps, resim } = setup();
    await send(deps, PLAYED);
    await resim.idle();
    const again = (await send(deps, PLAYED)).body as ChallengeRunReply;
    expect(again).toMatchObject({ status: 'repeat', rank: 1, total: 1 });
    expect(resim.length).toBe(0);
  });

  it('refuse a forged run after re-simulation and keep it as a report', async () => {
    const { deps, resim, store, logs } = setup();
    const forged = { run: PLAYED.run, replay: { ...PLAYED.replay, hash: (PLAYED.replay.hash ^ 1) >>> 0 } };
    expect((await send(deps, forged)).body).toMatchObject({ status: 'pending' });
    await resim.idle();
    expect(store.challenges.size).toBe(0);
    expect(store.reportList.length).toBe(1);
    expect(store.reportList[0].text).toContain('hash');
    expect(store.reportList[0].replay?.hash).toBe(forged.replay.hash);
    expect(logs[0]).toContain('hash');
  });

  it('enter a run outside the top at once, unverified', async () => {
    const { deps, store, resim } = setup();
    const board = challengeBoardId(DAILY.id, ENGINE_VERSION, 1);
    // a full board of better runs
    for (let i = 0; i < RESIM_TOP; i++) {
      const run = { ...PLAYED.run, install: `install${String(i).padStart(4, '0')}`, wave: 40 };
      store.challenges.set(`${board}/t${i}`, { board, tag: `t${i}`, challenge: DAILY.id, score: 40e6, run, at: NOW - 1000, state: 'entered', verified: true });
    }
    const reply = (await send(deps, PLAYED)).body as ChallengeRunReply;
    expect(reply).toMatchObject({ status: 'ranked', rank: RESIM_TOP + 1, total: RESIM_TOP + 1 });
    expect(resim.length).toBe(0);
  });

  it('refuse a closed challenge, a misfit run and a bad board', async () => {
    const { deps } = setup();
    expect((await send(deps, PLAYED, 'd20261001')).body).toEqual({ error: 'closed' });
    const seeded = { ...PLAYED, replay: { ...PLAYED.replay, config: { ...PLAYED.replay.config, seed: 3 } } };
    expect((await send(deps, seeded)).body).toEqual({ error: 'seed' });
    expect((await route(req('POST', '/v1/challenge/runs', { challenge: DAILY.id, run: PLAYED.run }), deps)).body).toEqual({ error: 'bad replay' });
    expect((await route(req('GET', '/v1/challenge/boards/c1'), deps)).status).toBe(400);
  });

  it('queue the pending runs again after a restart', async () => {
    const { store } = setup();
    const entry: ChallengeEntry = { board: challengeBoardId(DAILY.id, ENGINE_VERSION, 1), tag: 'tag1', challenge: DAILY.id, ...PLAYED };
    await store.challengeRun(entry, NOW);
    const resim = new ResimQueue(store, engineFor, () => NOW, () => {}, (fn) => setTimeout(fn, 0));
    await resim.start();
    expect(resim.length).toBe(1);
    await resim.idle();
    expect((await store.pendingResims()).length).toBe(0);
    expect((await store.challengeBoard(entry.board, 50, 'tag1')).mine?.rank).toBe(1);
  });
});
