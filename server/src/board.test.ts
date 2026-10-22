import { ENGINE_VERSION } from '@hk/engine';
import { describe, expect, it } from 'vitest';
import { boardReplay, boardUpdate, newBest, provisionalRank, settleBoardDoc, type BoardDoc } from './boardDocs';
import type { BoardReply, ReplayWire, RunEntry } from './protocol';
import { chapterConfig, resimulate } from './resim';
import { ResimQueue } from './resimQueue';
import { route, type Deps, type Req } from './routes';
import { MemoryStore } from './store';
import { INSTALL, playChapter } from './testPlay';

const NOW = Date.parse('2026-10-22T09:30:00Z');
const PLAYED = playChapter();
const OTHER = 'zzzzzzzz9999';

function setup() {
  const store = new MemoryStore();
  const logs: string[] = [];
  const resim = new ResimQueue(store, ENGINE_VERSION, () => NOW, (l) => logs.push(l), (fn) => setTimeout(fn, 0));
  const deps: Deps = { store, tagSalt: 'salt', adminKey: 'key', now: () => NOW, allow: () => true, resim };
  return { store, resim, deps, logs };
}

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Req {
  return { method, path, query: new URLSearchParams(), headers, body, ip: '1.2.3.4' };
}

const send = (d: Deps, played: { run: RunEntry; replay: ReplayWire | null }) => route(req('POST', '/v1/runs', { ...played.run, replay: played.replay }), d);
const board = async (d: Deps, install = INSTALL) => (await route(req('GET', '/v1/boards/c1', undefined, { 'x-hk-install': install }), d)).body as BoardReply;

describe('a chapter run\'s replay', () => {
  it('passes the re-simulation as played', () => {
    expect(resimulate(PLAYED.replay, PLAYED.run, ENGINE_VERSION, chapterConfig).ok).toBe(true);
  });

  it('is kept only when the server can check it', () => {
    const { run, replay } = PLAYED;
    expect(boardReplay(run, replay, ENGINE_VERSION)).toBe(replay);
    expect(boardReplay(run, null, ENGINE_VERSION)).toBeNull();
    // an older engine, a run started past wave 1, a length that is not the run's
    expect(boardReplay(run, replay, ENGINE_VERSION + 1)).toBeNull();
    expect(boardReplay(run, { ...replay, wave: 5 }, ENGINE_VERSION)).toBeNull();
    expect(boardReplay({ ...run, tenths: run.tenths + 10 }, replay, ENGINE_VERSION)).toBeNull();
  });

  it('must have a config the chapter run could have had', () => {
    const { run, replay } = PLAYED;
    const c = replay.config;
    expect(chapterConfig(c, run)).not.toBeNull();
    expect(chapterConfig({ ...c, revives: 3 }, run)).not.toBeNull();
    expect(chapterConfig({ ...c, firstRun: true }, run)?.firstRun).toBe(true);
    expect(chapterConfig({ ...c, revives: 4 }, run)).toBeNull();
    expect(chapterConfig({ ...c, waves: 20 }, run)).toBeNull();
    expect(chapterConfig({ ...c, chapter: 2 }, run)).toBeNull();
    expect(chapterConfig({ ...c, hard: true }, run)).toBeNull();
    expect(chapterConfig({ ...c, relic: 'fish' }, run)).toBeNull();
    expect(chapterConfig({ ...c, mutator: 'swarm' }, run)).toBeNull();
  });
});

describe('a board row', () => {
  const at = NOW - 1000;
  const best = (score: number, t = at, tag = 'a'): BoardDoc => ({ ...newBest('c1', tag, PLAYED.run, t), score });

  it('waits as a hidden row, or beside the shown best, until verified', () => {
    expect(boardUpdate(null, best(5), null)).toBe('unverified');
    const first = boardUpdate(null, best(5), PLAYED.replay) as BoardDoc;
    expect(first).toMatchObject({ state: 'pending', replay: PLAYED.replay });
    const shown = settleBoardDoc(first, at, true)!;
    expect(shown).toMatchObject({ verified: true, score: 5 });
    expect(shown.replay).toBeUndefined();
    expect(settleBoardDoc(first, at, false)).toBeNull();
    // a better run waits beside it; a worse one, or one no better than the one waiting, changes nothing
    const waiting = boardUpdate(shown, best(9, NOW), PLAYED.replay) as BoardDoc;
    expect(waiting).toMatchObject({ score: 5, next: { score: 9, at: NOW } });
    expect(boardUpdate(waiting, best(8, NOW + 1), PLAYED.replay)).toBe('lower');
    // refused, the old best stays; verified, the new one takes its place
    expect(settleBoardDoc(waiting, NOW, false)).toEqual(shown);
    expect(settleBoardDoc(waiting, NOW, true)).toMatchObject({ score: 9, at: NOW, verified: true });
    expect(settleBoardDoc(waiting, NOW + 5, true)).toBeUndefined();
  });

  it('ranks among the shown rows only, its own aside', () => {
    const rows: BoardDoc[] = [best(9, at, 'b'), { ...best(20, at, 'c'), state: 'pending' }, best(30, at, 'a'), best(3, at, 'd')];
    expect(provisionalRank(best(7, NOW, 'a'), rows)).toBe(2);
  });
});

describe('the chapter boards', () => {
  it('show a run once its re-simulation passes, and tell its rank at once', async () => {
    const { deps, resim, store } = setup();
    const reply = await send(deps, PLAYED);
    expect(reply.body).toMatchObject({ board: 'c1', rank: 1, best: true, status: 'pending' });
    expect((await board(deps)).rows).toEqual([]);
    await resim.idle();
    const after = await board(deps);
    expect(after.rows.length).toBe(1);
    expect(after.mine).toMatchObject({ rank: 1, wave: PLAYED.run.wave });
    expect(await store.pendingResims()).toEqual([]);
  });

  it('drop a forged run and keep it as a report, the best before it still shown', async () => {
    const { deps, resim, store, logs } = setup();
    const short = playChapter(900);
    await send(deps, short);
    await resim.idle();
    const forged = { run: PLAYED.run, replay: { ...PLAYED.replay, hash: (PLAYED.replay.hash ^ 1) >>> 0 } };
    expect((await send(deps, forged)).body).toMatchObject({ status: 'pending' });
    await resim.idle();
    expect((await board(deps)).mine).toMatchObject({ wave: short.run.wave });
    expect(store.reportList.length).toBe(1);
    expect(store.reportList[0].text).toContain('hash');
    expect(logs[0]).toContain('hash');
  });

  it('keep no run from an older engine or with no replay', async () => {
    const { deps, resim } = setup();
    expect((await send(deps, { run: PLAYED.run, replay: null })).body).toMatchObject({ status: 'unverified', best: true });
    expect((await send(deps, { run: PLAYED.run, replay: { ...PLAYED.replay, engine: ENGINE_VERSION - 1 } })).body).toMatchObject({ status: 'unverified' });
    expect(resim.length).toBe(0);
    expect((await board(deps)).total).toBe(0);
  });

  it('still show a row kept before the boards were checked', async () => {
    const { deps, store } = setup();
    // grandfathered: no state, never re-simulated
    const old: BoardDoc = newBest('c1', 'old', { ...PLAYED.run, install: OTHER, wave: 45 }, NOW - 1e6);
    (store as unknown as { best: Map<string, BoardDoc> }).best.set('c1/old', old);
    const reply = await send(deps, PLAYED);
    expect(reply.body).toMatchObject({ rank: 2 });
    expect((await board(deps)).rows.map((r) => r.wave)).toEqual([45]);
  });

  it('queue the waiting runs again after a restart', async () => {
    const { store } = setup();
    await store.submitRun(PLAYED.run, 'tag1', PLAYED.replay, NOW);
    const resim = new ResimQueue(store, ENGINE_VERSION, () => NOW, () => {}, (fn) => setTimeout(fn, 0));
    await resim.start();
    expect(resim.length).toBe(1);
    await resim.idle();
    expect((await store.board('c1', 50, 'tag1')).mine?.rank).toBe(1);
  });
});
