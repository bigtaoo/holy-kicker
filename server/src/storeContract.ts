import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CloudVault } from './cloudVault';
import { RESIM_TOP, WATCH_TOP, boardId, challengeBoardId, type EventBatch, type Game, type PickWire, type ReplayWire, type Report, type RunEntry } from './protocol';
import { PERF_KEEP_DAYS, PRUNE_EVERY_DAYS, type ChallengeEntry, type Store } from './store';

// What every Store (and CloudVault) must do, whichever keeps the data: storeParity.test.ts runs
// these against MemoryStore always and against MongoStore when a test Mongo is reachable, so the
// production store cannot drift from the one every other server test runs on.

export type Open<T> = () => Promise<{ it: T; done?: () => Promise<void> }>;

const NOW = Date.parse('2026-10-22T09:30:00Z');
const DAY = 86_400_000;
const PICKS: PickWire[] = [{ tick: 30, wave: 1, offered: ['spell:nova', 'spell:bell'], took: 0 }];
const REPLAY: ReplayWire = { engine: 1, config: { seed: 1 }, wave: 1, cmds: [1, 2, 3], tick: 300, hash: 7 };

const run = (o: Partial<RunEntry> = {}): RunEntry => ({ install: 'install00001', host: 'web', build: '1.0', chapter: 1, hard: false, won: false, wave: 10, tenths: 900, level: 5, kills: 0, monk: 'novice', relic: 'staff', ...o });

/** A fresh store per test, closed (and its data dropped) after it. */
function fresh<T>(open: Open<T>): () => T {
  let cur: { it: T; done?: () => Promise<void> } | null = null;
  beforeEach(async () => {
    cur = await open();
  });
  afterEach(async () => {
    await cur?.done?.();
    cur = null;
  });
  return () => cur!.it;
}

export function storeContract(name: string, open: Open<Store>): void {
  describe(`${name}: chapter boards`, () => {
    const store = fresh(open);
    /** A run sent and verified, as the board shows it. */
    const shown = async (tag: string, r: RunEntry, at: number) => {
      const t = await store().submitRun(r, tag, REPLAY, at);
      await store().settleBoardRun(t.board, tag, at, true);
      return t;
    };

    it('keep each install\'s best, a better run waiting beside it until verified', async () => {
      await shown('a', run({ wave: 10 }), NOW);
      expect(await store().submitRun(run({ wave: 5 }), 'a', REPLAY, NOW + 1)).toEqual({ board: 'c1', rank: 1, best: false, status: 'lower', at: NOW + 1 });
      expect(await store().submitRun(run({ wave: 12 }), 'a', REPLAY, NOW + 2)).toMatchObject({ rank: 1, best: true, status: 'pending' });
      // no better than the one waiting
      expect(await store().submitRun(run({ wave: 11 }), 'a', REPLAY, NOW + 3)).toMatchObject({ status: 'lower' });
      const meanwhile = await store().board('c1', 10, 'a');
      expect(meanwhile).toMatchObject({ total: 1, own: 'pending', mine: { rank: 1, wave: 10 } });
      expect(meanwhile.rows.map((r) => r.wave)).toEqual([10]);
      await store().settleBoardRun('c1', 'a', NOW + 2, true);
      const after = await store().board('c1', 10, 'a');
      expect(after.rows.map((r) => r.wave)).toEqual([12]);
      expect(after.own).toBeUndefined();
      expect(after.total).toBe(1);
    });

    it('keep the best when its better run is refused, and tell the install', async () => {
      await shown('a', run({ wave: 10 }), NOW);
      await store().submitRun(run({ wave: 12 }), 'a', REPLAY, NOW + 1);
      await store().settleBoardRun('c1', 'a', NOW + 1, false);
      expect(await store().board('c1', 10, 'a')).toMatchObject({ own: 'refused', mine: { wave: 10 }, total: 1 });
      // a verdict on a run the row no longer holds changes nothing
      await store().settleBoardRun('c1', 'a', NOW + 99, true);
      expect((await store().board('c1', 10, 'a')).rows.map((r) => r.wave)).toEqual([10]);
    });

    it('show no pending, refused or stale row, and keep none without a replay', async () => {
      expect(await store().submitRun(run(), 'a', null, NOW)).toEqual({ board: 'c1', rank: 0, best: false, status: 'unverified', at: NOW });
      expect(await store().board('c1', 10, 'a')).toEqual({ board: 'c1', total: 0, rows: [], mine: null });
      await store().submitRun(run(), 'p', REPLAY, NOW);
      await store().submitRun(run(), 'r', REPLAY, NOW);
      await store().settleBoardRun('c1', 'r', NOW, false);
      await store().submitRun(run(), 's', REPLAY, NOW);
      await store().settleBoardRun('c1', 's', NOW, 'stale');
      expect(await store().board('c1', 10, 'p')).toEqual({ board: 'c1', total: 0, rows: [], mine: null, own: 'pending' });
      expect(await store().board('c1', 10, 'r')).toEqual({ board: 'c1', total: 0, rows: [], mine: null, own: 'refused' });
      expect(await store().board('c1', 10, 's')).toEqual({ board: 'c1', total: 0, rows: [], mine: null });
      // a refused or stale row holds no place: a lower run takes it over
      expect(await store().submitRun(run({ wave: 2 }), 'r', REPLAY, NOW + 1)).toMatchObject({ status: 'pending', best: true });
      expect((await store().pendingResims()).map((r) => r.tag).sort()).toEqual(['p', 'r']);
    });

    it('rank clears by time, then the furthest wave, then the time to it, ties to the earlier', async () => {
      const runs: [string, Partial<RunEntry>, number][] = [
        ['w8', { wave: 8, tenths: 900 }, NOW],
        ['c9000', { won: true, wave: 50, tenths: 9000 }, NOW],
        ['w30slow', { wave: 30, tenths: 6000 }, NOW],
        ['c8000', { won: true, wave: 50, tenths: 8000 }, NOW],
        ['w30late', { wave: 30, tenths: 5000 }, NOW + 5],
        ['w30fast', { wave: 30, tenths: 5000 }, NOW + 1],
        ['w49', { wave: 49, tenths: 12000 }, NOW],
      ];
      for (const [tag, r, at] of runs) await shown(tag, run(r), at);
      const all = await store().board('c1', 50, null);
      expect(all.rows.map((r) => r.tag)).toEqual(['c8000', 'c9000', 'w49', 'w30fast', 'w30late', 'w30slow', 'w8']);
      expect(all.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(all.mine).toBeNull();
      // the limit cuts the rows, never the total or the asker's own rank
      const top = await store().board('c1', 2, 'w30late');
      expect(top.rows.map((r) => r.tag)).toEqual(['c8000', 'c9000']);
      expect(top).toMatchObject({ total: 7, mine: { rank: 5, tag: 'w30late', won: false, wave: 30, tenths: 5000, level: 5, monk: 'novice', relic: 'staff' } });
      // a new run's provisional rank among the shown rows, its own aside
      expect(await store().submitRun(run({ wave: 40 }), 'w8', REPLAY, NOW + 9)).toMatchObject({ rank: 4, status: 'pending' });
      expect(await store().submitRun(run({ wave: 40 }), 'new', REPLAY, NOW + 9)).toMatchObject({ rank: 4 });
      // a run not kept keeps the place the install had
      expect(await store().submitRun(run({ wave: 1 }), 'w30slow', REPLAY, NOW + 9)).toMatchObject({ rank: 6, status: 'lower' });
    });

    it('stand apart by mode and game', async () => {
      await shown('a', run({ wave: 10 }), NOW);
      await shown('a', run({ wave: 11, hard: true }), NOW);
      await shown('a', run({ wave: 12, game: 'corgi' }), NOW);
      await shown('a', run({ wave: 13, chapter: 2 }), NOW);
      for (const [b, wave] of [[boardId(1, false), 10], [boardId(1, true), 11], [boardId(1, false, 'corgi'), 12], [boardId(2, false), 13]] as const) {
        const reply = await store().board(b, 10, 'a');
        expect(reply.rows.map((r) => r.wave)).toEqual([wave]);
        expect(reply.total).toBe(1);
      }
      expect(boardId(1, false, 'corgi')).toBe('c1-corgi');
    });

    it('show the name a run carried, the latest one replacing the last', async () => {
      await shown('a', run({ name: 'Monk' }), NOW);
      await shown('b', run({ dice: 42, wave: 9 }), NOW);
      await shown('c', run({ wave: 8 }), NOW);
      const names = async () => (await store().board('c1', 10, null)).rows.map((r) => [r.tag, r.name, r.dice]);
      expect(await names()).toEqual([['a', 'Monk', 0], ['b', '', 42], ['c', '', 0]]);
      await store().setName('a', { dice: 7 }, NOW);
      await store().setName('b', { name: 'Kick' }, NOW);
      expect(await names()).toEqual([['a', '', 7], ['b', 'Kick', 0], ['c', '', 0]]);
    });

    it('name the waiting runs and hand each over while its row still holds it', async () => {
      await store().submitRun(run(), 'p', REPLAY, NOW);
      await shown('n', run(), NOW);
      await store().submitRun(run({ wave: 20 }), 'n', REPLAY, NOW + 1);
      const refs = (await store().pendingResims()).sort((a, b) => a.tag.localeCompare(b.tag));
      expect(refs).toEqual([{ kind: 'board', board: 'c1', tag: 'n', at: NOW + 1 }, { kind: 'board', board: 'c1', tag: 'p', at: NOW }]);
      expect(await store().resimJob(refs[0])).toEqual({ run: run({ wave: 20 }), replay: REPLAY, what: 'board c1' });
      expect(await store().resimJob({ ...refs[0], at: NOW })).toBeNull();
      expect(await store().resimJob({ ...refs[0], tag: 'nobody' })).toBeNull();
      await store().settleBoardRun('c1', 'n', NOW + 1, true);
      expect(await store().resimJob(refs[0])).toBeNull();
    });
  });

  describe(`${name}: challenge boards`, () => {
    const store = fresh(open);
    const DAILY = 'd20261022';
    const WEEK = 'w2026-43';
    const dailyBoard = challengeBoardId(DAILY, 50, 1);
    const weekBoard = challengeBoardId(WEEK, 50, 2);
    const entry = (board: string, tag: string, r: Partial<RunEntry> = {}, game?: Game): ChallengeEntry => ({ board, tag, challenge: board.split('-e')[0], run: run({ ...r, ...(game ? { game } : {}) }), replay: REPLAY });
    /** A run sent and passed by the re-simulation. */
    const entered = async (e: ChallengeEntry, at: number) => {
      const r = await store().challengeRun(e, at);
      await store().settleChallengeRun(e.board, e.tag, at, PICKS);
      return r;
    };

    it('keep a daily\'s first run only', async () => {
      expect(await store().challengeRun(entry(dailyBoard, 'a'), NOW)).toEqual({ board: dailyBoard, status: 'pending', rank: 1, total: 1 });
      expect(await store().challengeRun(entry(dailyBoard, 'a', { wave: 30 }), NOW + 1)).toEqual({ board: dailyBoard, status: 'repeat', rank: 1, total: 1 });
      await store().settleChallengeRun(dailyBoard, 'a', NOW, []);
      const b = await store().challengeBoard(dailyBoard, 10, 'a');
      expect(b).toMatchObject({ total: 1, pending: false, mine: { rank: 1, wave: 10 } });
      expect(b.rows.map((r) => r.wave)).toEqual([10]);
      expect(b.top).toBeUndefined();
      // a daily keeps no replay to watch
      expect(await store().challengeReplay(dailyBoard, 'a')).toBeNull();
    });

    it('keep a weekly\'s best, a better run waiting beside it until checked', async () => {
      await entered(entry(weekBoard, 'a', { wave: 10 }), NOW);
      expect(await store().challengeRun(entry(weekBoard, 'a', { wave: 9 }), NOW + 1)).toEqual({ board: weekBoard, status: 'lower', rank: 1, total: 1 });
      expect(await store().challengeRun(entry(weekBoard, 'a', { wave: 20 }), NOW + 2)).toEqual({ board: weekBoard, status: 'pending', rank: 1, total: 1 });
      const meanwhile = await store().challengeBoard(weekBoard, 10, 'a');
      expect(meanwhile).toMatchObject({ pending: true, total: 1, mine: { wave: 10 } });
      expect(await store().pendingResims()).toEqual([{ kind: 'challenge', board: weekBoard, tag: 'a', at: NOW + 2 }]);
      expect(await store().resimJob({ kind: 'challenge', board: weekBoard, tag: 'a', at: NOW + 2 })).toEqual({ run: run({ wave: 20 }), replay: REPLAY, what: `challenge ${WEEK}` });
      // refused: the best stands
      await store().settleChallengeRun(weekBoard, 'a', NOW + 2, null);
      expect((await store().challengeBoard(weekBoard, 10, 'a')).rows.map((r) => r.wave)).toEqual([10]);
      await store().challengeRun(entry(weekBoard, 'a', { wave: 20 }), NOW + 3);
      await store().settleChallengeRun(weekBoard, 'a', NOW + 3, []);
      const after = await store().challengeBoard(weekBoard, 10, 'a');
      expect(after.rows.map((r) => r.wave)).toEqual([20]);
      expect(after.pending).toBe(false);
      expect(await store().pendingResims()).toEqual([]);
    });

    it('drop a refused first run, and keep one no engine can check aside', async () => {
      await store().challengeRun(entry(weekBoard, 'a'), NOW);
      await store().settleChallengeRun(weekBoard, 'a', NOW, null);
      expect(await store().challengeBoard(weekBoard, 10, 'a')).toMatchObject({ total: 0, mine: null, pending: false });
      // dropped, the next run is a first run again
      expect(await store().challengeRun(entry(weekBoard, 'a', { wave: 2 }), NOW + 1)).toMatchObject({ status: 'pending' });
      await store().settleChallengeRun(weekBoard, 'a', NOW + 1, 'stale');
      expect(await store().pendingResims()).toEqual([]);
      expect((await store().challengeBoard(weekBoard, 10, null)).total).toBe(0);
    });

    it('rank by score then time, publish the top runs and their replays, and count a pending own row', async () => {
      const waves = [12, 30, 20, 30, 5];
      for (const [k, wave] of waves.entries()) await entered(entry(weekBoard, `t${k}`, { wave, tenths: 3000 }), NOW + k);
      await store().challengeRun(entry(weekBoard, 'late', { wave: 25 }), NOW + 10);
      const b = await store().challengeBoard(weekBoard, 4, 'late');
      expect(b.rows.map((r) => [r.tag, r.rank])).toEqual([['t1', 1], ['t3', 2], ['t2', 3], ['t0', 4]]);
      expect(b).toMatchObject({ total: 6, pending: true, mine: { tag: 'late', rank: 3 } });
      expect(b.top).toEqual(['t1', 't3', 't2'].map((tag) => ({ tag, picks: PICKS, replay: true })));
      expect(await store().challengeReplay(weekBoard, 't1')).toEqual(REPLAY);
      expect(await store().challengeReplay(weekBoard, 't0')).toBeNull();
      expect(await store().challengeReplay(weekBoard, 'late')).toBeNull();
      expect(await store().challengeReplay(weekBoard, 'nobody')).toBeNull();
      expect(WATCH_TOP).toBe(3);
      const none = await store().challengeBoard(weekBoard, 10, null);
      expect(none).toMatchObject({ total: 5, mine: null, pending: false });
    });

    it('enter a run outside the top at once, unverified', async () => {
      for (let k = 0; k < RESIM_TOP; k++) await entered(entry(dailyBoard, `t${k}`, { wave: 40 }), NOW);
      expect(await store().challengeRun(entry(dailyBoard, 'low', { wave: 3 }), NOW + 1)).toEqual({ board: dailyBoard, status: 'ranked', rank: RESIM_TOP + 1, total: RESIM_TOP + 1 });
      expect(await store().pendingResims()).toEqual([]);
      expect((await store().challengeBoard(dailyBoard, 1, 'low')).mine).toMatchObject({ rank: RESIM_TOP + 1 });
    }, 30_000);

    it('keep each engine\'s and game\'s board apart, and rank a week\'s boards', async () => {
      const other = challengeBoardId(WEEK, 51, 2);
      const corgi = challengeBoardId(WEEK, 50, 2, 'corgi');
      await entered(entry(weekBoard, 'a', { wave: 10 }), NOW);
      await entered(entry(weekBoard, 'b', { wave: 11 }), NOW);
      await entered(entry(other, 'c', { wave: 12 }), NOW);
      await entered(entry(corgi, 'd', { wave: 13 }, 'corgi'), NOW);
      await entered(entry(challengeBoardId('w2026-44', 50, 2), 'e'), NOW);
      await store().challengeRun(entry(other, 'p', { wave: 50 }), NOW);
      expect((await store().challengeBoard(weekBoard, 10, null)).rows.map((r) => r.tag)).toEqual(['b', 'a']);
      expect((await store().challengeBoard(other, 10, null)).rows.map((r) => r.tag)).toEqual(['c']);
      expect((await store().challengeBoard(corgi, 10, null)).rows.map((r) => r.tag)).toEqual(['d']);
      const ranks = (await store().weekRanks(WEEK)).map((b) => b.join()).sort();
      expect(ranks).toEqual(['b,a', 'c', 'd']);
      expect(await store().weekRanks('w2026-40')).toEqual([]);
    });
  });

  describe(`${name}: reports, events and upkeep`, () => {
    const store = fresh(open);
    const report = (text: string, replay: ReplayWire | null = REPLAY): Report => ({ install: 'install00001', host: 'web', build: '1.0', locale: 'en', text, device: 'test', chapter: 1, wave: 3, replay });
    const batch = (events: EventBatch['events'], o: Partial<EventBatch> = {}): EventBatch => ({ install: 'install00001', session: 's1', host: 'web', build: '1.0', locale: 'en', events, ...o });

    it('keep reports, list the newest first without their replays, and answer one whole', async () => {
      const a = await store().addReport(report('first'), NOW);
      const b = await store().addReport(report('second', null), NOW + 1);
      expect(a).toMatch(/^[0-9a-f]{16}$/);
      const list = await store().reports(10);
      expect(list.map((r) => [r.id, r.text, r.at, r.ticks])).toEqual([[b, 'second', NOW + 1, 0], [a, 'first', NOW, REPLAY.tick]]);
      expect(list[1]).not.toHaveProperty('replay');
      expect((await store().reports(1)).map((r) => r.id)).toEqual([b]);
      expect(await store().report(a)).toEqual({ ...report('first'), id: a, at: NOW });
      expect(await store().report('0000000000000000')).toBeNull();
    });

    it('count events once, however often a batch is sent', async () => {
      const events = [{ e: 'session' as const, t: NOW, n: 1 }, { e: 'run_start' as const, t: NOW, n: 2 }];
      await store().addEvents(batch(events), NOW);
      await store().addEvents(batch(events), NOW + 1);
      // one sent twice within a batch, and one without a number (never deduplicated)
      await store().addEvents(batch([{ e: 'run_start', t: NOW, n: 3 }, { e: 'run_start', t: NOW, n: 3 }, { e: 'run_start', t: NOW }]), NOW + 2);
      const s = await store().stats(1, NOW, null);
      expect(s.days).toEqual([{ day: '2026-10-22', active: 1, fresh: 1, runs: 3, ended: 0 }]);
    });

    it('count beacons by day, host and game', async () => {
      await store().beacon('web', 'open_desktop', '1.0', NOW, '0-1s');
      await store().beacon('web', 'open_desktop', '1.0', NOW, null);
      await store().beacon('ios', 'open_desktop', '1.0', NOW, null);
      await store().beacon('web', 'open_desktop', '1.0', NOW, null, 'corgi');
      expect((await store().stats(1, NOW, 'web')).beacons).toEqual([{ day: '2026-10-22', build: '1.0', step: 'open_desktop', n: 2, t: { '0-1s': 1 } }]);
      expect((await store().stats(1, NOW, 'web', undefined, 'corgi')).beacons).toEqual([{ day: '2026-10-22', build: '1.0', step: 'open_desktop', n: 1 }]);
    });

    it('prune old perf and anomaly events weekly, and nothing else', async () => {
      const old = NOW - (PERF_KEEP_DAYS + 1) * DAY;
      await store().addEvents(batch([{ e: 'perf', t: old, p: { fps: 60 } }, { e: 'anomaly', t: old, p: { kind: 'x' } }, { e: 'run_start', t: old }]), old);
      await store().addEvents(batch([{ e: 'perf', t: NOW, p: { fps: 50 } }], { session: 's2' }), NOW);
      expect(await store().prune(NOW)).toBe(2);
      expect(await store().prune(NOW + DAY)).toBeNull();
      expect(await store().prune(NOW + PRUNE_EVERY_DAYS * DAY)).toBe(0);
      const s = await store().stats(PERF_KEEP_DAYS + 5, NOW, null);
      expect(s.days.reduce((n, d) => n + d.runs, 0)).toBe(1);
    });

    it('answer a ping', async () => {
      await expect(store().ping()).resolves.toBeUndefined();
    });
  });
}

export function vaultContract(name: string, open: Open<CloudVault>): void {
  describe(`${name}: cloud save slots`, () => {
    const vault = fresh(open);

    it('make one slot per code and per Game Center player', async () => {
      expect(await vault().create('code1', 'monk', null, NOW)).toBe(true);
      expect(await vault().create('code1', 'corgi', null, NOW)).toBe(false);
      expect(await vault().create('code2', 'monk', 'gc1', NOW)).toBe(true);
      expect(await vault().create('code3', 'monk', 'gc1', NOW)).toBe(false);
      expect(await vault().create('code4', 'monk', null, NOW)).toBe(true);
      expect(await vault().byGc('gc1')).toBe('code2');
      expect(await vault().byGc('gc2')).toBeNull();
      expect(await vault().read('code1')).toEqual({ game: 'monk', rev: 0, version: 0, save: null });
      expect(await vault().read('code3')).toBeNull();
    });

    it('never let an older save or revision overwrite a newer one', async () => {
      await vault().create('code1', 'corgi', null, NOW);
      expect(await vault().write('code1', 0, 3, 'v3', NOW)).toBe('ok');
      expect(await vault().read('code1')).toEqual({ game: 'corgi', rev: 1, version: 3, save: 'v3' });
      // a writer that read revision 0 has missed the write above
      expect(await vault().write('code1', 0, 4, 'v4', NOW)).toBe('stale');
      // a lower version over the current revision
      expect(await vault().write('code1', 1, 2, 'v2', NOW)).toBe('stale');
      // the same version again is taken (a resend)
      expect(await vault().write('code1', 1, 3, 'v3b', NOW)).toBe('ok');
      expect(await vault().read('code1')).toEqual({ game: 'corgi', rev: 2, version: 3, save: 'v3b' });
      expect(await vault().write('nobody', 0, 1, 'x', NOW)).toBe('none');
    });
  });
}
