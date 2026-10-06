import { LIMITS } from '@hk/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '../platform/types';
import { Backend } from './backend';

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

  it('says where the player was as the game goes to the background, in the same send', async () => {
    const calls = server({ ok: true, status: 204 });
    const host = platform();
    const net = new Backend(host, 'https://api.test', '1.0.0', () => 'en');
    net.onLeave(() => ({ place: 'run', secs: 42, wave: 7 }));
    host.hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(sent(calls[0]).events).toEqual([{ e: 'leave', t: expect.any(Number), p: { place: 'run', secs: 42, wave: 7 } }]);
  });

  it('enters a run and reads back its rank, null for an answer without one', async () => {
    const calls = server({ ok: true, body: { board: 'c2h', rank: 4, best: true } }, { ok: true, body: { rank: 0 } }, { ok: false, status: 429 });
    const net = new Backend(platform(), 'https://api.test', '1.0.0', () => 'en');
    const run = { chapter: 2, hard: true, won: false, wave: 12, tenths: 4000, level: 9, kills: 500, monk: 'kicker', relic: 'staff' };
    expect(await net.submitRun(run)).toEqual({ board: 'c2h', rank: 4, best: true });
    expect(sent(calls[0])).toEqual({ ...run, install: net.install, host: 'crazygames', build: '1.0.0' });
    expect(await net.submitRun(run)).toBeNull();
    expect(await net.submitRun(run)).toBeNull();
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
