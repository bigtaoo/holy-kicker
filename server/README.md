# @hk/server: analytics, leaderboards and problem reports

A small Node HTTP service, `hk-api`, at **https://hk.gamestao.com**. The game sends it
analytics batches and finished chapter runs, and reads leaderboards from it. Everything is
anonymous: an install keeps a random id (`hk.install` in the host's storage), and boards show
a tag the server derives from that id (HMAC with `HK_TAG_SALT`), never the id itself.

**Names.** Nobody types a name, so the boards carry no player-made text to moderate (no
`msgSecCheck` on WeChat, no approval for user content on Poki). A player signed in to a portal
account goes by its name: CrazyGames asks for it, and moderates its names itself. Everyone
else goes by a dice name, an adjective, a noun and a number from the string tables' lists
(`board.adjs` / `board.nouns`), rolled on the first launch and rolled again with the die next
to the name in the lobby (`client/src/ui/playerName.ts`). The server keeps the dice name as one
integer (`packDice` in `src/protocol.ts`), so each viewer reads it in their own language. It
takes a text name from `crazygames` only, checked by `checkName` (length, letters, a blocklist)
as a guard against a client that sends something else as one. A row without either (runs from
before names) goes by a dice name made from its tag.

## API

| Route | What |
|---|---|
| `GET /health` | `{ ok: true }` |
| `POST /v1/events` | an `EventBatch` (src/protocol.ts): up to 50 events, names from `EVENT_NAMES` → 204 |
| `POST /v1/runs` | a `RunEntry`: kept if it is the install's best on its board → `{ board, rank, best, tag }`; its `name` or `dice`, if the rules take it, becomes the install's name |
| `POST /v1/name` | a `NameEntry` `{ install, host, name \| dice }`: the install's name on every board → `{ ok: true }`, or 400 `bad name` |
| `GET /v1/boards/c<N>[h]` | top 50 of chapter N (h: hard), plus the caller's own row (header `x-hk-install`) |
| `POST /v1/reports` | a `Report`: the player's note, device, chapter and wave, and a replay of the run (up to 3 MB) → `{ id }` |
| `GET /v1/reports?limit=50` | the newest reports without their replays; `Authorization: Bearer $HK_ADMIN_KEY` |
| `GET /v1/reports/<id>` | one report whole, replay included (same key) |
| `GET /v1/stats?days=14&host=crazygames` | operator numbers (src/stats.ts): daily actives, new installs, runs, boards, retention cohorts (D1/3/7/14/30, null until the day is over), the new-player funnel and D1 by what day 0 looked like; `host` optional; `Authorization: Bearer $HK_ADMIN_KEY` |
| `GET /dash` | the operator's dashboard over `/v1/stats` (src/dash.html; asks for the admin key, keeps it in the browser). How to read it and what to change: docs/retention.md |

A run ranks by: a win over any loss, then more waves, then less time (`runScore`). Every request
is checked whole (`src/rules.ts`) and refused on anything unexpected; a run that could not have
happened (a win short of the last wave, under 4 s per wave) is refused too. Each caller IP has a
token bucket per route (`RATES` in `src/routes.ts`). Runs on the boards are not replayed yet.

**Problem reports** come from the pause panel's "Report a problem" (`client/src/ui/problemReport.ts`):
the host's text box (a DOM dialog on the web, `wx.showModal` on WeChat), then the note with an
`engine/replay.ts` Replay: the RunConfig, the start wave, the commands that changed something
(5 numbers each) and the tick and `hashState` at the moment of the report. `checkReplay` plays it
back and says whether it lands on the same hash (it needs the same `ENGINE_VERSION`), and
`replayEngine` gives an engine to step through it. Offline development builds save the report as
a JSON file instead.

The client side is `client/src/net/` (`Backend`: queue, flush every 20 s and on hide, best
effort) and `client/src/ui/boardPanel.ts` (the Ranks button on the lobby's chapter card). A run
goes on a board only when no dev URL switch bends the rules (`rankedRun` in `game/scene.ts`).
Development builds stay offline unless `?api=http://localhost:8080`; WeChat stays offline
until the backend has an ICP-filed domain on the mini-game's request whitelist.

## Storage

MongoDB Atlas, a cluster of its own (`cluster0.qcp0r96`, not daydayup's), database `holykicker` (`HK_MONGO_DB`):
`events` (TTL 90 days), `installs` (one per install, src/players.ts: first day, host, first build, the days it came back and its day 0, folded as batches arrive), `active` (install per day), `best` (one
per install per board), `names` (one per named install, by tag: a portal name or a dice name), `reports` (TTL 180 days). Without `HK_MONGO_URI` the server keeps everything in memory
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

Every green push to `main` deploys it (`.github/workflows/ci.yml`, job `deploy-server`, before
the web build goes out); a push that leaves the bundle unchanged restarts nothing. By hand:

```bash
npm run deploy:server        # build, ship, docker compose up, wait for both containers
```

### Deploy from CI

CI holds an ssh key (`D:\cloud\holykicker_ci_ed25519`, the only readable copy; the private
half is the repo Secret `SERVER_DEPLOY_KEY`) that can do one thing on the box: it is registered
in `/home/deploy/.ssh/authorized_keys` as
`command="/home/deploy/holykicker-ci-deploy.sh",restrict ssh-ed25519 AAAA... holykicker-ci`, so
whatever it asks for, sshd runs `server/deploy/ci-deploy.sh` as `deploy`, with no pty and no
forwarding. Repo Variables: `SERVER_DEPLOY_ENABLED=true`, `SERVER_SSH_KNOWN_HOSTS` (the box's
ed25519 host key line, checked against `/etc/ssh/ssh_host_ed25519_key.pub`).

The live script sits outside the deploy target so a deploy cannot replace it; after editing
`ci-deploy.sh`, install it again:

```bash
tr -d '
' < server/deploy/ci-deploy.sh | ssh blightbloom 'install -o deploy -g deploy -m 700 /dev/stdin /home/deploy/holykicker-ci-deploy.sh'
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
