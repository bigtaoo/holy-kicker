/**
 * boot.ts under vitest: the fake platform and app (testkit/fakePlatform.ts, headless.ts), a
 * backend behind a fake `fetch` that keeps cloud slots and records every call, the page's own
 * storage (the board outbox) and the `?api=` a development build reads its backend from.
 */
import { vi } from 'vitest';
import { MemoryStore } from '../meta/saveStore';
import { installHeadless } from './headless';

/** What the fake backend saw, in order: `POST /v1/runs`, `POST /v1/cloud/read`, `GET /v1/beacon`… */
export interface FakeServer {
  calls: string[];
  /** The event batches posted, as sent. */
  batches: { exp?: string; events: { e: string }[] }[];
  /** Cloud slots by code: a revision and the save's text. */
  slots: Map<string, { rev: number; save: string | null }>;
  /** Every request hangs, never answered (a backend that is down without refusing). */
  hang: boolean;
  fetch: typeof fetch;
}

export const API = 'http://hk.test';

/** `calls` may be a log the test shares with other recorders, to read one order across them. */
export function fakeServer(calls: string[] = []): FakeServer {
  const server: FakeServer = { calls, batches: [], slots: new Map(), hang: false, fetch: null as never };
  let next = 0;
  const reply = (status: number, body?: unknown) => new Response(body === undefined ? '' : JSON.stringify(body), { status });
  server.fetch = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const path = url.pathname;
    server.calls.push(`${init.method ?? 'GET'} ${path}`);
    if (server.hang) return new Promise<Response>(() => {});
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (path === '/v1/events') server.batches.push(body as never);
    if (path === '/v1/runs') return reply(200, { rank: 1 });
    if (!path.startsWith('/v1/cloud/')) return reply(path === '/v1/events' ? 200 : 404, path === '/v1/events' ? {} : undefined);
    const op = path.split('/').pop();
    if (op === 'new') {
      const code = `ABCDEFGHJK${String(next++).padStart(2, '0')}`;
      server.slots.set(code, { rev: 0, save: null });
      return reply(200, { code, rev: 0 });
    }
    const slot = server.slots.get(body.code as string);
    if (!slot) return reply(404);
    if (op === 'read') return reply(200, slot);
    if (body.base !== slot.rev) return reply(409, slot);
    slot.rev++;
    slot.save = body.save as string;
    return reply(200, { rev: slot.rev });
  }) as unknown as typeof fetch;
  return server;
}

/** A cloud slot holding `save`, under a code the device keeps (hk.cloud). */
export function slotWith(server: FakeServer, save: unknown): string {
  const code = `MNPQRSTV${String(server.slots.size).padStart(4, '0')}`;
  server.slots.set(code, { rev: 1, save: JSON.stringify(save) });
  return code;
}

/** The browser around boot: `?api=` pointing at `server`, its fetch, and the page's storage. */
export function bootGlobals(server: FakeServer, page = new MemoryStore()): MemoryStore {
  installHeadless();
  vi.stubGlobal('location', { search: `?api=${API}`, href: `${API}/` });
  vi.stubGlobal('fetch', server.fetch);
  vi.stubGlobal('localStorage', page);
  // QualityRuntime's frame loop: never called back, frames come from the tests' own ticks
  vi.stubGlobal('requestAnimationFrame', () => 0);
  return page;
}
