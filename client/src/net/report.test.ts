import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '../platform/types';
import { Backend, type ReportDraft } from './backend';

// Backend.report: the draft goes out whole, with who sent it, and the answer is a plain yes or no.

function platform(): Platform {
  const kept = new Map<string, string>();
  return {
    host: 'web',
    storage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) },
    onHide: () => {},
  } as unknown as Platform;
}

const draft: ReportDraft = { text: 'stuck', device: 'Test phone', chapter: 2, wave: 14, replay: null };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Backend.report', () => {
  it('posts the draft with the install, host, build and language, without keepalive', async () => {
    vi.useFakeTimers();
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ id: '0123456789abcdef' }) };
    });
    const net = new Backend(platform(), 'https://api.test', '1.2.3', () => 'de');
    expect(await net.report(draft)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.test/v1/reports');
    expect(calls[0].init.method).toBe('POST');
    // keepalive bodies are capped at 64 kB, and a replay can be larger
    expect(calls[0].init.keepalive).toBe(false);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ ...draft, install: net.install, host: 'web', build: '1.2.3', locale: 'de' });
  });

  it('says no when the server refuses it, the network fails or there is no backend', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 400, json: async () => ({}) }));
    expect(await new Backend(platform(), 'https://api.test', '1', () => 'en').report(draft)).toBe(false);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await new Backend(platform(), 'https://api.test', '1', () => 'en').report(draft)).toBe(false);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await new Backend(platform(), null, '1', () => 'en').report(draft)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('waits longer for a report than for analytics before giving up', async () => {
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      });
    }));
    const net = new Backend(platform(), 'https://api.test', '1', () => 'en');
    const sent = net.report(draft);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(aborted).toBe(true);
    expect(await sent).toBe(false);
  });
});
