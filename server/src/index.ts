import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { MongoStore } from './mongoStore';
import { Limiter, RATES, route } from './routes';
import { MemoryStore, type Store } from './store';

// The Holy Kicker backend process (server/README.md): one small HTTP server behind the box's
// Caddy, which terminates TLS for hk.gamestao.com. Configuration comes from the environment:
//   PORT            listen port (default 8080)
//   HK_MONGO_URI    Atlas connection string; without it the store is in memory (development)
//   HK_MONGO_DB     database name (default holykicker)
//   HK_TAG_SALT     secret for the board tags (required with HK_MONGO_URI)
//   HK_ADMIN_KEY    bearer key for GET /v1/stats (unset: the route answers 401)

const MAX_BODY = 32 * 1024;

const env = process.env;
const port = Number(env.PORT) || 8080;
const uri = env.HK_MONGO_URI ?? '';
if (uri && !env.HK_TAG_SALT) throw new Error('HK_TAG_SALT is required with HK_MONGO_URI');

const store: Store = uri ? await MongoStore.open(uri, env.HK_MONGO_DB || 'holykicker') : new MemoryStore();
const limiter = new Limiter(RATES, Date.now);
const deps = { store, tagSalt: env.HK_TAG_SALT || 'dev', adminKey: env.HK_ADMIN_KEY ?? '', now: Date.now, allow: limiter.allow.bind(limiter) };

/** Any page may call the API: it is anonymous and sets no cookies (the game runs in portal iframes). */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-hk-install, authorization',
  'access-control-max-age': '86400',
};

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', reject);
  });
}

/** The caller: Caddy is the only way in and puts the client's address first in X-Forwarded-For. */
function ipOf(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || '?';
}

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }
  let body: unknown;
  try {
    body = req.method === 'POST' ? await readBody(req) : undefined;
  } catch {
    res.writeHead(413, CORS).end();
    return;
  }
  const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const reply = await route({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers, body, ip: ipOf(req) }, deps);
  if (reply.body === undefined) res.writeHead(reply.status, CORS).end();
  else res.writeHead(reply.status, { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(reply.body));
}

const server = createServer((req, res) => {
  serve(req, res).catch((err) => {
    console.error('request failed', req.method, req.url, err);
    if (!res.headersSent) res.writeHead(500, CORS);
    res.end();
  });
});
server.listen(port, () => console.log(`holykicker api on :${port} (${uri ? 'mongo' : 'memory'} store)`));

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close();
    store.close().finally(() => process.exit(0));
  });
}
