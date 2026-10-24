import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { MemoryVault, MongoVault } from './cloudVault';
import { engineFor } from './engines';
import { appleKeys } from './gameCenter';
import { BodyGate, ipOf, MAX_BODY, maxBody, pageLang, readBody } from './http';
import { WeekMarks } from './marks';
import { MongoStore } from './mongoStore';
import { pageGame, privacyPage } from './privacyPage';
import { DiskShelf, MemoryShelf, type ReplayShelf } from './replayShelf';
import { ResimQueue } from './resimQueue';
import { Limiter, RATES, rateOf, route } from './routes';
import { MemoryStore, type Store } from './store';

// The backend's wiring, apart from the process (index.ts) so a test can start it: the store and
// the vault chosen from the environment (index.ts lists the variables), the re-simulation queue,
// and the request handler that puts the routes behind CORS, rate limits and body limits.

/** Replies longer than this (bytes of JSON) go gzipped to a client that takes it. */
const GZIP_FROM = 4096;

/** Any page may call the API: it is anonymous and sets no cookies (the game runs in portal iframes). */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-hk-install, authorization',
  'access-control-max-age': '86400',
};

/** The HTML pages the server answers itself (bundled as text by build.mjs). */
export interface Pages {
  dash: string;
  privacyEn: string;
  privacyZh: string;
}

export interface App {
  store: Store;
  replays: ReplayShelf;
  /** 'mongo' or 'memory', for the start line. */
  kind: 'mongo' | 'memory';
  /** The server's request listener: a request that throws answers 500. */
  listener(req: IncomingMessage, res: ServerResponse): void;
}

export async function openApp(env: NodeJS.ProcessEnv, pages: Pages, log: (line: string) => void = (line) => console.log(line)): Promise<App> {
  const uri = env.HK_MONGO_URI ?? '';
  if (uri && !env.HK_TAG_SALT) throw new Error('HK_TAG_SALT is required with HK_MONGO_URI');
  const dbName = env.HK_MONGO_DB || 'holykicker';
  const store: Store = uri ? await MongoStore.open(uri, dbName) : new MemoryStore();
  const limiter = new Limiter(RATES, Date.now);
  // challenge runs are re-simulated here, one at a time, off the request path
  const resim = new ResimQueue(store, engineFor, Date.now, log);
  await resim.start();
  const marks = new WeekMarks(store, Date.now);
  const replays = env.HK_REPLAY_DIR ? await DiskShelf.open(env.HK_REPLAY_DIR) : new MemoryShelf();
  // the cloud save's slots (cloudSave.ts), in Mongo beside the rest
  const cloud = { vault: uri ? await MongoVault.open(uri, dbName) : new MemoryVault(), gcKey: appleKeys() };
  const bigReads = new BodyGate();
  const deps = { store, tagSalt: env.HK_TAG_SALT || 'dev', adminKey: env.HK_ADMIN_KEY ?? '', now: Date.now, allow: limiter.allow.bind(limiter), resim, marks, replays, cloud };

  async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://local');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    // the operator's numbers page: it holds no data, it asks for the admin key and reads /v1/stats
    if (req.method === 'GET' && url.pathname === '/dash') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' }).end(pages.dash);
      return;
    }
    // the game's privacy policy, linked from its settings and the consent card (en, or zh by ?lang= or
    // the browser), the corgi's under its own name by ?g=corgi
    if (req.method === 'GET' && url.pathname === '/privacy') {
      const lang = pageLang(url.searchParams, req.headers['accept-language']);
      const page = privacyPage(lang === 'zh' ? pages.privacyZh : pages.privacyEn, lang, pageGame(url.searchParams));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', 'referrer-policy': 'no-referrer' }).end(page);
      return;
    }
    // the caller's rate is charged before its body is read, and big bodies are read a few at a time
    const method = req.method ?? 'GET';
    const ip = ipOf(req);
    const rate = rateOf(method, url.pathname);
    if (rate && !limiter.allow(rate, ip)) {
      res.writeHead(429, { ...CORS, connection: 'close' }).end();
      return;
    }
    const limit = maxBody(url.pathname);
    const big = method === 'POST' && limit > MAX_BODY;
    if (big && !bigReads.take()) {
      res.writeHead(503, { ...CORS, 'retry-after': '5', connection: 'close' }).end();
      return;
    }
    let body: unknown;
    try {
      body = method === 'POST' ? await readBody(req, limit) : undefined;
    } catch (err) {
      res.writeHead((err as Error).message === 'too slow' ? 408 : 413, { ...CORS, connection: 'close' }).end();
      return;
    } finally {
      if (big) bigReads.give();
    }
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
    const reply = await route({ method, path: url.pathname, query: url.searchParams, headers, body, ip, rated: true }, deps);
    if (reply.body === undefined) res.writeHead(reply.status, CORS).end();
    else {
      // replays and boards with their pick timelines are big and compress well
      const json = JSON.stringify(reply.body);
      const zip = json.length > GZIP_FROM && /gzip/.test(String(req.headers['accept-encoding'] ?? ''));
      const head = { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'accept-encoding' };
      if (zip) res.writeHead(reply.status, { ...head, 'content-encoding': 'gzip' }).end(gzipSync(json));
      else res.writeHead(reply.status, head).end(json);
    }
  }

  function listener(req: IncomingMessage, res: ServerResponse): void {
    serve(req, res).catch((err) => {
      console.error('request failed', req.method, req.url, err);
      if (!res.headersSent) res.writeHead(500, CORS);
      res.end();
    });
  }

  return { store, replays, kind: uri ? 'mongo' : 'memory', listener };
}
