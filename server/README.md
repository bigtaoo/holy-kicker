# @hk/server: analytics and leaderboards

A small Node HTTP service, `hk-api`, at **https://hk.gamestao.com**. The game sends it
analytics batches and finished chapter runs, and reads leaderboards from it. Everything is
anonymous: an install keeps a random id (`hk.install` in the host's storage), and boards show
a tag the server derives from that id (HMAC with `HK_TAG_SALT`), never the id itself. The
client turns the tag into a friendly name from the string table (`board.adjs` / `board.nouns`),
so nobody types a name and nothing needs moderating.

## API

| Route | What |
|---|---|
| `GET /health` | `{ ok: true }` |
| `POST /v1/events` | an `EventBatch` (src/protocol.ts): up to 50 events, names from `EVENT_NAMES` → 204 |
| `POST /v1/runs` | a `RunEntry`: kept if it is the install's best on its board → `{ board, rank, best, tag }` |
| `GET /v1/boards/c<N>[h]` | top 50 of chapter N (h: hard), plus the caller's own row (header `x-hk-install`) |
| `GET /v1/stats?days=14` | operator numbers (daily active, new installs, runs, clear rate and median lost wave per board, D1/D7 retention); `Authorization: Bearer $HK_ADMIN_KEY` |

A run ranks by: a win over any loss, then more waves, then less time (`runScore`). Every request
is checked whole (`src/rules.ts`) and refused on anything unexpected; a run that could not have
happened (a win short of the last wave, under 4 s per wave) is refused too. Each caller IP has a
token bucket per route (`RATES` in `src/routes.ts`). Runs are not replayed yet: the engine is
deterministic, so a later step can send seed and commands and replay them here.

The client side is `client/src/net/` (`Backend`: queue, flush every 20 s and on hide, best
effort) and `client/src/ui/boardPanel.ts` (the Ranks button on the lobby's chapter card). A run
goes on a board only when no dev URL switch bends the rules (`rankedRun` in `game/scene.ts`).
Development builds stay offline unless `?api=http://localhost:8080`; WeChat stays offline
until the backend has an ICP-filed domain on the mini-game's request whitelist.

## Storage

MongoDB Atlas, a cluster of its own (`cluster0.qcp0r96`, not daydayup's), database `holykicker` (`HK_MONGO_DB`):
`events` (TTL 90 days), `installs` (first day seen), `active` (install per day), `best` (one
per install per board). Without `HK_MONGO_URI` the server keeps everything in memory
(development, tests).

## Running

```bash
npm run dev -w server        # memory store on :8080
npm test -w server
```

## Deploy

It runs on the box daydayup owns (Hetzner `blightbloom`, 62.238.1.182; ssh alias
`blightbloom`) and shares nothing with daydayup but the machine: its own compose project in
`/home/deploy/holykicker` (`deploy/`), its own network, its own Atlas cluster, its own secrets.
Two containers: `hk-api` (128 MB, no published port) and `hk-tunnel` (cloudflared). The
box's ports 80/443 are daydayup's Caddy, so the way in is a Cloudflare Tunnel: `hk-tunnel`
dials out to Cloudflare, which serves https://hk.gamestao.com and passes the requests down to
`http://api:8080`. The client's address arrives in `CF-Connecting-IP`.

```bash
npm run deploy:server        # build, ship, docker compose up, wait for both containers
```

Secrets live in `D:secrets` (`secrets/holykicker/prod.yaml`); the box keeps them in
`/home/deploy/holykicker/.env`, which the deploy never touches. To (re)write it:

```bash
sops -d --output-type dotenv secrets/holykicker/prod.yaml | ssh blightbloom 'umask 077; cat > /home/deploy/holykicker/.env; chown deploy:deploy /home/deploy/holykicker/.env'
```

Variables: `HK_MONGO_URI` (the box's IP is on that Atlas project's Network Access list),
`HK_MONGO_DB`, `HK_TAG_SALT` (never change it: every tag, so every board name, would change),
`HK_ADMIN_KEY`, `HK_TUNNEL_TOKEN` (the tunnel's connector token).

The tunnel is remotely managed (Cloudflare Zero Trust → Networks → Tunnels): its one public
hostname is `hk.gamestao.com` → `http://api:8080`, and Cloudflare keeps the proxied (orange)
DNS record for it.
