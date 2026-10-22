import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { ENGINE_VERSION } from '@hk/engine';
import DASH from './dash.html';
import { ipOf, maxBody, pageLang, readBody } from './http';
import PRIVACY_EN from './privacy.en.html';
import PRIVACY_ZH from './privacy.zh.html';
import { pageGame, privacyPage } from './privacyPage';
import { WeekMarks } from './marks';
import { MongoStore } from './mongoStore';
import { MemoryVault, MongoVault } from './cloudVault';
import { appleKeys } from './gameCenter';
import { DiskShelf, MemoryShelf } from './replayShelf';
import { ResimQueue } from './resimQueue';
import { Limiter, RATES, route } from './routes';
import { MemoryStore, type Store } from './store';

// The Holy Kicker backend process (server/README.md): one small HTTP server behind the box's
// Caddy, which terminates TLS for hk.gamestao.com. Configuration comes from the environment:
//   PORT            listen port (default 8080)
//   HK_MONGO_URI    Atlas connection string; without it the store is in memory (development)
//   HK_MONGO_DB     database name (default holykicker)
//   HK_TAG_SALT     secret for the board tags (required with HK_MONGO_URI)
//   HK_ADMIN_KEY    bearer key for GET /v1/stats, /v1/reports and /v1/replays (unset: they answer 401)
//   HK_REPLAY_DIR   where collected replays are kept (replayShelf.ts); without it, in memory

const env = process.env;
const port = Number(env.PORT) || 8080;
const uri = env.HK_MONGO_URI ?? '';
if (uri && !env.HK_TAG_SALT) throw new Error('HK_TAG_SALT is required with HK_MONGO_URI');

const store: Store = uri ? await MongoStore.open(uri, env.HK_MONGO_DB || 'holykicker') : new MemoryStore();
const limiter = new Limiter(RATES, Date.now);
// challenge runs are re-simulated here, one at a time, off the request path
const resim = new ResimQueue(store, ENGINE_VERSION, Date.now, (line) => console.log(line));
await resim.start();
const marks = new WeekMarks(store, Date.now);
const replays = env.HK_REPLAY_DIR ? await DiskShelf.open(env.HK_REPLAY_DIR) : new MemoryShelf();
// the cloud save's slots (cloudSave.ts), in Mongo beside the rest
const cloud = { vault: uri ? await MongoVault.open(uri, env.HK_MONGO_DB || 'holykicker') : new MemoryVault(), gcKey: appleKeys() };
const deps = { store, tagSalt: env.HK_TAG_SALT || 'dev', adminKey: env.HK_ADMIN_KEY ?? '', now: Date.now, allow: limiter.allow.bind(limiter), resim, marks, replays, cloud };

/** Replies longer than this (bytes of JSON) go gzipped to a client that takes it. */
const GZIP_FROM = 4096;

/** Any page may call the API: it is anonymous and sets no cookies (the game runs in portal iframes). */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-hk-install, authorization',
  'access-control-max-age': '86400',
};

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }
  // the operator's numbers page: it holds no data, it asks for the admin key and reads /v1/stats
  if (req.method === 'GET' && url.pathname === '/dash') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' }).end(DASH);
    return;
  }
  // the game's privacy policy, linked from its settings and the consent card (en, or zh by ?lang= or
  // the browser), the corgi's under its own name by ?g=corgi
  if (req.method === 'GET' && url.pathname === '/privacy') {
    const lang = pageLang(url.searchParams, req.headers['accept-language']);
    const page = privacyPage(lang === 'zh' ? PRIVACY_ZH : PRIVACY_EN, lang, pageGame(url.searchParams));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', 'referrer-policy': 'no-referrer' }).end(page);
    return;
  }
  let body: unknown;
  try {
    body = req.method === 'POST' ? await readBody(req, maxBody(url.pathname)) : undefined;
  } catch {
    res.writeHead(413, CORS).end();
    return;
  }
  const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const reply = await route({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers, body, ip: ipOf(req) }, deps);
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

const server = createServer((req, res) => {
  serve(req, res).catch((err) => {
    console.error('request failed', req.method, req.url, err);
    if (!res.headersSent) res.writeHead(500, CORS);
    res.end();
  });
});
server.listen(port, () => console.log(`holykicker api on :${port} (${uri ? 'mongo' : 'memory'} store)`));

// weekly prune of raw perf telemetry (Store.prune): looked at a minute after start and every few
// hours, since each deploy restarts the process; the store remembers when it last ran. Collected
// replays past their days go at the same times.
const PRUNE_LOOK_MS = 6 * 3600_000;
function prune(): void {
  store.prune(Date.now()).then(
    (n) => n !== null && console.log(`pruned ${n} perf and anomaly events`),
    (err) => console.error('prune failed', err),
  );
  replays.prune(Date.now()).then(
    (n) => n > 0 && console.log(`pruned ${n} collected replays`),
    (err) => console.error('replay prune failed', err),
  );
}
setTimeout(prune, 60_000).unref();
setInterval(prune, PRUNE_LOOK_MS).unref();

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close();
    store.close().finally(() => process.exit(0));
  });
}
