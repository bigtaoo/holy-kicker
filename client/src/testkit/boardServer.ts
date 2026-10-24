/**
 * The backend for headless board tests: the server's own router (server/src/routes.ts) on its
 * in-memory store, answering the client's fetch, so what the screens read is what the server
 * makes of the runs, never a hand-written reply. Chapter-board runs are judged at once (passed,
 * refused or held pending, as a test chooses); challenge runs go through the real re-simulation
 * queue, which also makes a weekly top run's picks. The link can be up, down, failing or silent.
 */
import { vi } from 'vitest';
import { ENGINE_VERSION } from '@hk/engine';
import { challengeBoardId, type Challenge, type ReplayWire, type RunEntry } from '@hk/protocol';
import { engineFor } from '../../../server/src/engines';
import { ResimQueue } from '../../../server/src/resimQueue';
import { route, tagOf, type Deps } from '../../../server/src/routes';
import type { ResimRef } from '../../../server/src/store';
import { MemoryStore } from '../../../server/src/store';
import { playRun } from '../../../server/src/testPlay';
import { THEME } from '../theme';

export const API = 'http://hk.test';
const SALT = 'boards';

/** How the link answers: the server's reply, no network (`down`), a 503 (`fail`), or never (`hang`). */
export type Link = 'up' | 'down' | 'fail' | 'hang';

export interface BoardServer {
  link: Link;
  /** The link for the client's posts alone, when it differs (an upload that fails while reads go through). */
  posts: Link | null;
  /** Every request as `METHOD path`, in order. */
  calls: string[];
  store: MemoryStore;
  /** What a chapter-board run's re-simulation says: passed (the default), refused, or not yet. */
  verdict: (tag: string) => 'pass' | 'refuse' | 'hold';
  /** Last week's tiers by tag, worn as marks beside the names. */
  marks: Map<string, number>;
  /** The tag the server gives `install`. */
  tag(install: string): string;
  /** A chapter run of `install` on its board, as the client posts it (with a replay the board takes as it is). */
  run(install: string, r: Partial<RunEntry>): Promise<void>;
  /** A real run of challenge `c` by `install`, played by the bot for `ticks`, re-simulated by the server. */
  challengeRun(c: Challenge, install: string, ticks: number, dice?: number): Promise<{ board: string; replay: ReplayWire }>;
  /** Resolves once every queued re-simulation is done. */
  idle(): Promise<void>;
  /** Answers the requests the `hang` link held, as the server would now. */
  release(): Promise<void>;
}

/** A replay whose shape the server takes; the chapter boards here take it as it is. */
const ANY_REPLAY: ReplayWire = { engine: ENGINE_VERSION, config: { seed: 5, waves: 50 }, wave: 1, cmds: [1, 0, 16384, 255, 0, 31, 0, 0, 0, 6], tick: 900, hash: 123456 };

/** The server, with the client's fetch pointed at it (restored by vi.unstubAllGlobals). */
export function boardServer(now: () => number = Date.now): BoardServer {
  const store = new MemoryStore();
  const queue = new ResimQueue(store, engineFor, now);
  const held: (() => void)[] = [];
  const srv: BoardServer = {
    link: 'up',
    posts: null,
    calls: [],
    store,
    verdict: () => 'pass',
    marks: new Map(),
    tag: (install) => tagOf(install, SALT),
    async run(install, r) {
      const run: RunEntry = { install, host: 'web', build: '0.0.1', game: THEME, chapter: 1, hard: false, won: false, wave: 10, tenths: 3000, level: 5, kills: 100, monk: 'kicker', relic: 'ball', ...r };
      const reply = await answer('POST', '/v1/runs', { ...run, replay: ANY_REPLAY }, {});
      if (reply.status !== 200) throw new Error(`the server refused the run: ${JSON.stringify(reply.body)}`);
    },
    async challengeRun(c, install, ticks, dice) {
      const { run, replay } = playRun(c, ticks, install);
      const reply = await answer('POST', '/v1/challenge/runs', { challenge: c.id, run: { ...run, game: THEME, ...(dice ? { dice } : {}) }, replay }, {});
      if (reply.status !== 200) throw new Error(`the server refused the challenge run: ${JSON.stringify(reply.body)}`);
      await queue.idle();
      return { board: challengeBoardId(c.id, c.engine, run.chapter, THEME), replay };
    },
    idle: () => queue.idle(),
    async release() {
      for (const go of held.splice(0)) go();
      await queue.idle();
    },
  };
  const resim = {
    push(ref: ResimRef) {
      if (ref.kind === 'challenge') return queue.push(ref);
      const v = srv.verdict(ref.tag);
      if (v !== 'hold') void store.settleBoardRun(ref.board, ref.tag, ref.at, v === 'pass');
    },
  };
  const deps: Deps = {
    store, tagSalt: SALT, adminKey: '', now, allow: () => true, resim,
    boardReplay: (_run, replay) => replay,
    marks: { current: async () => srv.marks },
  };
  const answer = (method: string, path: string, body: unknown, headers: Record<string, string>) => {
    const [pathname, query = ''] = path.split('?');
    return route({ method, path: pathname, query: new URLSearchParams(query), headers, body, ip: '10.0.0.1' }, deps);
  };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = url.slice(API.length);
    srv.calls.push(`${method} ${path}`);
    const link = (method === 'POST' && srv.posts) || srv.link;
    if (link === 'down') throw new TypeError('Failed to fetch');
    if (link === 'fail') return new Response(null, { status: 503 });
    if (link === 'hang') await new Promise<void>((go) => held.push(go));
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const reply = await answer(method, path, init.body ? JSON.parse(init.body as string) : undefined, headers);
    const json = reply.body === undefined ? null : JSON.stringify(reply.body);
    return new Response(json, { status: reply.status, headers: json ? { 'content-type': 'application/json' } : {} });
  });
  return srv;
}
