import { createServer } from 'node:http';
import { openApp } from './app';
import DASH from './dash.html';
import PRIVACY_EN from './privacy.en.html';
import PRIVACY_ZH from './privacy.zh.html';

// The Holy Kicker backend process (server/README.md): one small HTTP server on daydayup's box,
// reached only through the Cloudflare tunnel, which terminates TLS for hk.gamestao.com. Configuration comes from the environment:
//   PORT            listen port (default 8080)
//   HK_MONGO_URI    Atlas connection string; without it the store is in memory (development)
//   HK_MONGO_DB     database name (default holykicker)
//   HK_TAG_SALT     secret for the board tags (required with HK_MONGO_URI)
//   HK_ADMIN_KEY    bearer key for GET /v1/stats, /v1/reports and /v1/replays (unset: they answer 401)
//   HK_REPLAY_DIR   where collected replays are kept (replayShelf.ts); without it, in memory

const port = Number(process.env.PORT) || 8080;
const { store, replays, kind, listener } = await openApp(process.env, { dash: DASH, privacyEn: PRIVACY_EN, privacyZh: PRIVACY_ZH });

const server = createServer(listener);
server.listen(port, () => console.log(`holykicker api on :${port} (${kind} store)`));

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
