import { LIMITS } from '@hk/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '../platform/types';
import { MemoryStore } from '../meta/saveStore';
import { Backend } from './backend';
import { BoardOutbox } from './boardOutbox';

// Backend: analytics batches, leaderboard runs and the install id, against a fake fetch.

interface Call {
  url: string;
  init: RequestInit;
}

function platform(kept = new Map<string, string>()): Platform & { hide: () => void } {
  const hides: (() => void)[] = [];
  return {
    host: 'crazygames',
    storage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) },
    onHide: (f: () => void) => void hides.push(f),
    hide: () => hides.forEach((f) => f()),
  } as unknown as Platform & { hide: () => void };
}

/** A fetch that answers each call with the next of `replies` (the last one repeats). */
function server(...replies: { ok: boolean; status?: number; body?: unknown }[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const r = replies[Math.min(calls.length, replies.length - 1)];
    calls.push({ url, init });
    return { ok: r.ok, status: r.status ?? 200, json: async () => r.body ?? {} };
  });
  return calls;
}

const sent = (c: Call) => JSON.parse(c.init.body as string);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Backend', () => {
  it('keeps one install id per device', () => {
    const kept = new Map<string, string>();
    const a = new Backend(platform(kept), null, '1.0.0', () => 'en');
    const b = new Backend(platform(kept), 'https://api.test', '1.0.0', () => 'en');
    expect(b.install).toBe(a.install);
    expect(new Backend(platform(), null, '1.0.0', () => 'en').install).not.toBe(a.install);
  });

  it("feeds the host's analytics unless sharing is off, online or not", () => {
    const seen: string[] = [];
    const shared: boolean[] = [];
    const host = { ...platform(), analytics: { event: (e: string) => void seen.push(e), share: (on: boolean) => void shared.push(on), frame: () => {} } };
    const net = new Backend(host, null, '1.0.0', () => 'en');
    net.track('run_start', { chapter: 1 });
    net.setSharing('hold');
    net.track('run_end', { chapter: 1 });
    net.setSharing('off');
    net.track('share');
    net.setSharing('send');
    net.track('tutorial');
    expect(seen).toEqual(['run_start', 'run_end', 'tutorial']);
    expect(shared).toEqual([true, false, true]);
  });

  it('does nothing offline', async () => {
    const calls = server({ ok: true });
    const net = new Backend(platform(), null, '1.0.0', () => 'en');
    expect(net.online).toBe(false);
    net.track('run_start', { chapter: 1 });
    await net.flush();
    expect(await net.submitRun({ chapter: 1, hard: false, won: false, wave: 3, tenths: 900, level: 2, kills: 40, monk: 'kicker', relic: 'ball' })).toBeNull();
    expect(await net.board('c1')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('sends the queued events in batches, kept alive as the tab goes away', async () => {
    const calls = server({ ok: true, status: 204 });
    const net = new Backend(platform(), 'https://api.test', '1.0.0', () => 'fr');
    for (let i = 0; i < LIMITS.batchEvents + 5; i++) net.track('run_start', { chapter: 1 });
    await net.flush();
    expect(calls.map((c) => c.url)).toEqual(['https://api.test/v1/events', 'https://api.test/v1/events']);
    expect(calls[0].init.keepalive).toBe(true);
    const batch = sent(calls[0]);
    expect(batch).toMatchObject({ install: net.install, host: 'crazygames', build: '1.0.0', locale: 'fr' });
    expect(batch.events).toHaveLength(LIMITS.batchEvents);
    expect(sent(calls[1]).events).toHaveLength(5);
    expect(sent(calls[1]).session).toBe(batch.session);
    // nothing left, nothing sent
    await net.flush();
    expect(calls).toHaveLength(2);
  });

  it('keeps a batch the server did not take for the next try', async () => {
    const calls = server({ ok: false, status: 503 }, { ok: true, status: 204 });
    const net = new Backend(platform(), 'https://api.test', '1.0.0', () => 'en');
    net.track('run_start', { chapter: 2 });
    net.track('run_end', { wave: 7 });
    await net.flush();
    expect(calls).toHaveLength(1);
    await net.flush();
    expect(calls).toHaveLength(2);
    expect(sent(calls[1]).events).toEqual(sent(calls[0]).events);
    await net.flush();
    expect(calls).toHaveLength(2);
  });

  it('sends one flush at a time', async () => {
    const calls = server({ ok: true, status: 204 });
    const net = new Backend(platform(), 'https://api.test', '1.0.0', () => 'en');
    net.track('run_start');
    await Promise.all([net.flush(), net.flush()]);
    expect(calls).toHaveLength(1);
  });

  it('flushes on a timer and when the game is hidden', async () => {
    const calls = server({ ok: true, status: 204 });
    const host = platform();
    const net = new Backend(host, 'https://api.test', '1.0.0', () => 'en');
    net.track('run_start');
    await vi.advanceTimersByTimeAsync(19_000);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(1);
    net.track('run_end');
    host.hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
  });

  it('sends the leave at once even while the timer batch is still on its way', async () => {
    const calls: Call[] = [];
    let answer = () => {};
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const reply = { ok: true, status: 204, json: async () => ({}) };
      return calls.length === 1 ? new Promise((r) => (answer = () => r(reply))) : Promise.resolve(reply);
    });
    const host = platform();
    const net = new Backend(host, 'https://api.test', '1.0.0', () => 'en');
    net.onLeave(() => ({ place: 'run', secs: 30 }));
    net.track('run_start');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toHaveLength(1);
    host.hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(sent(calls[1]).events.map((e: { e: string }) => e.e)).toEqual(['leave']);
    answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
  });

  it('says where the player was as the game goes to the background, in the same send', async () => {
    const calls = server({ ok: true, status: 204 });
    const host = platform();
    const net = new Backend(host, 'https://api.test', '1.0.0', () => 'en');
    net.onLeave(() => ({ place: 'run', secs: 42, wave: 7 }));
    net.onHidden(() => net.track('perf', { why: 'leave', secs: 60 }));
    host.hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(sent(calls[0]).events).toEqual([
      { e: 'leave', t: expect.any(Number), n: 1, p: { place: 'run', secs: 42, wave: 7 } },
      { e: 'perf', t: expect.any(Number), n: 2, p: { why: 'leave', secs: 60 } },
    ]);
  });

  it('enters a run with its replay and reads back its rank, or why it has none', async () => {
    const calls = server(
      { ok: true, body: { board: 'c2h', rank: 4, best: true } },
      { ok: true, body: { rank: 0 } },
      { ok: false, status: 429 },
      { ok: true, body: { board: 'c2h', rank: 2, best: true } },
      { ok: false, status: 400, body: { error: 'replay' } },
    );
    const net = new Backend(platform(), 'https://api.test', '1.0.0', () => 'en', new BoardOutbox(new MemoryStore()));
    const run = { chapter: 2, hard: true, won: false, wave: 12, tenths: 4000, level: 9, kills: 500, monk: 'kicker', relic: 'staff' };
    const replay = { engine: 48, config: { seed: 5 }, wave: 1, cmds: [1, 2, 3], tick: 12000, hash: 7 };
    expect(await net.submitRun(run, replay)).toEqual({ board: 'c2h', rank: 4, best: true });
    expect(sent(calls[0])).toEqual({ ...run, install: net.install, host: 'crazygames', build: '1.0.0', game: 'monk', replay });
    // a small run still arrives as the tab closes, a long replay does not hold the page
    expect(calls[0].init.keepalive).toBe(true);
    expect(await net.submitRun(run, { ...replay, cmds: new Array(LIMITS.replayNumbers).fill(255) })).toBeNull();
    expect(calls[1].init.keepalive).toBe(false);
    expect(net.boardQueued('c2h')).toBe(false);
    // the rate limit answers nothing: the run waits on the device and goes again
    expect(await net.submitRun(run, replay)).toBe('queued');
    expect(net.boardQueued('c2h')).toBe(true);
    await net.resendBoards();
    expect(sent(calls[3])).toEqual(sent(calls[2]));
    expect(net.boardQueued('c2h')).toBe(false);
    // a refusal is an answer: nothing waits, and the player is told the run was not checked
    expect(await net.submitRun(run)).toBe('unverified');
    expect(net.boardQueued('c2h')).toBe(false);
  });

  it('holds events until sharing is on and drops them once it is off; the boards have their own switch', async () => {
    const calls = server({ ok: true, status: 204, body: { rows: [] } });
    const net = new Backend(platform(), 'https://api.test', '1.0.0', () => 'en', new BoardOutbox(new MemoryStore()));
    const run = { chapter: 1, hard: false, won: false, wave: 3, tenths: 900, level: 2, kills: 40, monk: 'kicker', relic: 'ball' };
    net.setSharing('hold');
    net.setBoards(false);
    net.track('run_start');
    await net.flush();
    expect(await net.submitRun(run)).toBe('off');
    expect(await net.sendName({ dice: 7 })).toBe(false);
    await net.board('c1');
    expect(calls.map((c) => c.url)).toEqual(['https://api.test/v1/boards/c1']);
    expect(calls[0].init.headers).toEqual({});
    // with the boards on, runs, names and board reads go as the install while events still wait
    net.setBoards(true);
    expect(await net.submitRun(run)).toBeNull();
    expect(await net.sendName({ dice: 7 })).toBe(true);
    await net.board('c1');
    expect(calls.slice(1).map((c) => c.url)).toEqual(['https://api.test/v1/runs', 'https://api.test/v1/name', 'https://api.test/v1/boards/c1']);
    expect(calls[3].init.headers).toEqual({ 'x-hk-install': net.install });
    net.setSharing('send');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(5);
    expect(sent(calls[4]).events).toEqual([{ e: 'run_start', t: expect.any(Number), n: expect.any(Number) }]);
    net.setSharing('off');
    net.track('run_end');
    net.setSharing('hold');
    net.setSharing('send');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(5);
  });

  it('reads a board as this install', async () => {
    const rows = { total: 0, rows: [], mine: null };
    const calls = server({ ok: true, body: rows });
    const net = new Backend(platform(), 'https://api.test', '1.0.0', () => 'en');
    expect(await net.board('c1')).toEqual(rows);
    expect(calls[0].url).toBe('https://api.test/v1/boards/c1');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].init.headers).toEqual({ 'x-hk-install': net.install });
  });
});
