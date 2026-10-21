# @hk/server: analytics, leaderboards and problem reports

A small Node HTTP service, `hk-api`, at **https://hk.gamestao.com**. The game sends it
analytics batches and finished chapter runs, and reads leaderboards from it. Everything is
anonymous: an install keeps a random id (`hk.install` in the host's storage), and boards show
a tag the server derives from that id (HMAC with `HK_TAG_SALT`), never the id itself.

**Names.** Nobody types a name, so the boards carry no player-made text to moderate (no
`msgSecCheck` on WeChat, no approval for user content on Poki). A player signed in to a portal
account goes by its name: CrazyGames asks for it, and moderates its names itself; on iOS a
player signed in to Game Center goes by its nickname (`GKLocalPlayer.alias`), though Game Center
is not required there. A guest on
a host with accounts (CrazyGames where the page offers them) stays off the boards: the client
neither shows them nor enters its runs. Everyone else (the web, WeChat, hosts without accounts)
goes by a dice name, an adjective, a noun and a number from the string tables' lists
(`board.adjs` / `board.nouns`), rolled on the first launch and rolled again with the die next
to the name in the lobby (`client/src/ui/playerName.ts`). The server keeps the dice name as one
integer (`packDice` in `src/protocol.ts`), so each viewer reads it in their own language. It
takes a text name from `crazygames` and `ios` only, checked by `checkName` (length, letters, a blocklist)
as a guard against a client that sends something else as one. A row without either (runs from
before names) goes by a dice name made from its tag.

## API

| Route | What |
|---|---|
| `GET /health` | `{ ok: true }` |
| `POST /v1/events` | an `EventBatch` (src/protocol.ts): up to 50 events, names from `EVENT_NAMES`; an event numbered `n` is kept once per session (`_id` `session/n`), so a batch sent again is not counted twice → 204 |
| `GET /v1/beacon?h=crazygames&s=open_touch&b=<build>` | an anonymous load checkpoint (`BEACONS`: `open_*` from the CrazyGames page before the SDK, `loaded_*` from the game's first screen): counted per day, host, build and step, no id, whatever the privacy answer → 204 |
| `POST /v1/runs` | a `RunEntry`: kept if it is the install's best on its board → `{ board, rank, best, tag }`; its `name` or `dice`, if the rules take it, becomes the install's name |
| `POST /v1/name` | a `NameEntry` `{ install, host, name \| dice }`: the install's name on every board → `{ ok: true }`, or 400 `bad name` |
| `GET /v1/boards/c<N>[h]` | top 50 of chapter N (h: hard), plus the caller's own row (header `x-hk-install`) |
| `GET /v1/challenge` | the open challenges (`ChallengeList`, src/challengeWire.ts) and the server's clock: today's daily, made from the UTC date (src/challenge.ts `dailyOf`: id `d20261019`, seed, chapter `furthest`, 50 waves for now, the server's `ENGINE_VERSION`), and this week's weekly (`weeklyOf`: id `w2026-43`, Monday 00:00 UTC to Monday, its relic, monk, sutras and chapter picked by hand in src/weeklies.ts, else a rotation) |
| `POST /v1/challenge/runs` | a `ChallengeRun`: the challenge id, a `RunEntry` and its replay (up to 3 MB). Checked against the record (src/challenge.ts: still open or closed at most 2 h ago (`LATE_MS`); `misfit`: the same engine version, the record's seed and waves, no revives, normal mode, a replay from wave 1, the run's chapter, relic and monk matching the replay's), then kept once per install per board (`<challenge>-e<engine>-c<chapter>`): a run that would rank in the top 100 (`RESIM_TOP`) waits `pending` for re-simulation, the rest enter unverified (a weekly keeps each install's best run instead: `lower` for one no better) → `{ board, status: pending \| ranked \| repeat \| lower, rank, total, tag }` |
| `GET /v1/challenge/boards/<board>` | top 50 of a challenge board, plus the caller's own row (`mine`, header `x-hk-install`) and whether it is still `pending`; a weekly's also lists its top 3 verified runs (`top`: tag, pick timeline, whether a replay is kept). Rows here and on the chapter boards carry `mark` (1–3), the tier their install reached in last week's weekly (src/marks.ts) |
| `GET /v1/challenge/boards/<board>/replays/<tag>` | the `ReplayWire` of a weekly top-3 run, to watch; 404 for any other |
| `POST /v1/reports` | a `Report`: the player's note, device, chapter and wave, and a replay of the run (up to 3 MB) → `{ id }` |
| `GET /v1/reports?limit=50` | the newest reports without their replays; `Authorization: Bearer $HK_ADMIN_KEY` |
| `GET /v1/reports/<id>` | one report whole, replay included (same key) |
| `GET /v1/replays/wanted` | `{ want }`: whether the install in `X-HK-Install` is asked for its run replays (`COLLECT` in src/replayShelf.ts) |
| `POST /v1/replays` | a `RunReplay`: a run's id, how it ended (`won`, `lost`, `quit`, or `hidden` for the run so far when the game went to the background) and its replay; 403 from an install not asked, 507 when the shelf is full |
| `GET /v1/replays?limit=100` | the newest collected replays, `{ name, at, bytes }`; `GET /v1/replays/<name>` one whole (admin key) |
| `GET /v1/stats?days=14&host=crazygames&to=2026-10-09` | operator numbers (src/stats.ts): daily actives, new installs, runs, boards (with the waves lost runs ended on), the first clears of each board (days and runs it took the window's new installs), retention cohorts (D1/3/7/14/30, null until the day is over), the new-player funnel, new installs by device, browser or app, browser, system and country (src/audience.ts: the user agent, the session's `device` and `app` (CrazyGames' `applicationType`, which tells its Android and iOS apps from browsers; else a web view guessed from the user agent) and Cloudflare's `CF-IPCountry`, kept once per install), D1 by what day 0 looked like, battle frame rates by device, system and build with the worst snapshots (`perf` events, src/perf.ts; GPU class, memory and cores from the launch's `session` event) with the textures, texture MB and display objects held, device anomalies by day, by build and kind, with the top errors by message and source (`anomaly`), and a `diagnosis`: findings over both (src/diagnose.ts: leaks within and across runs, memory, lost contexts, stalls, errors, slow devices, a frame-rate drop after a deploy) with the numbers and where in the client to look; `host` optional; `to` (UTC day) ends the window early, for a past week or one finished day (`days=1`), while returns still count up to today; `Authorization: Bearer $HK_ADMIN_KEY` |
| `GET /privacy` | the game's privacy policy (src/privacy.en.html; `?lang=zh` or a Chinese browser gets src/privacy.zh.html), linked from the game's settings and its consent card |
| `GET /dash` | the operator's dashboard over `/v1/stats` (src/dash.html; asks for the admin key, keeps it in the browser). How to read it and what to change: docs/retention.md |

A run ranks by: a win over any loss, then more waves, then less time (`runScore`). Every request
is checked whole (`src/rules.ts`) and refused on anything unexpected; a run that could not have
happened (a win short of the last wave, under 4 s per wave) is refused too. Each caller IP has a
token bucket per route (`RATES` in `src/routes.ts`). Runs on the chapter boards are not replayed.

**Challenge runs** (docs/design.md "Challenges") are re-simulated off the request path
(src/resimQueue.ts): one pending run at a time, a slice of ticks per turn of the event loop. The
replay must land on the `hashState`, outcome, wave, level and time the run claims
(src/resim.ts); then the run enters the board with its pick timeline (each level-up and shrine:
tick, wave, cards offered, card taken). A mismatch drops the run and is kept as a problem report
with the replay (it may be a determinism bug, not a cheat). After a restart the queue picks up
the store's pending runs again.

**Problem reports** come from the pause panel's "Report a problem" (`client/src/ui/problemReport.ts`):
the host's text box (a DOM dialog on the web, `wx.showModal` on WeChat), then the note with an
`engine/replay.ts` Replay: the RunConfig, the start wave, the commands that changed something
(5 numbers each) and the tick and `hashState` at the moment of the report. `checkReplay` plays it
back and says whether it lands on the same hash (it needs the same `ENGINE_VERSION`), and
`replayEngine` gives an engine to step through it. Offline development builds save the report as
a JSON file instead.

`npm run replays -- --fetch=50` (with `HK_ADMIN_KEY` set), or `npm run replays -- report.json ...`,
reads replays for the operator (`src/replayStats.ts`, `src/replayReport.ts`): per run the damage by
source, each death with what was around the hero, a row per wave (kills, health, how many mobs were
on screen and near, how clumped they stood), how the stick was played (idle, circling, leading the
horde behind the hero), and across runs how often each card was taken when offered. Each replay
plays on the engine it was recorded with: an older `ENGINE_VERSION`'s `engine/` is taken from git
into a temp cache. A run reported twice counts once in the totals.

Collected run replays: for the early days the server asks installs for every real run's replay
(`COLLECT` in `src/replayShelf.ts`: the percent of installs, by a hash of the id, and the last day;
now 100% until 2026-12-31; lower it and push to stop sooner). The client asks once per launch and
sends at the run's end and, for the run so far, when the game goes to the background
(`client/src/net/runReplays.ts`), only while the player allows statistics. Each is kept under the
install's tag and the run's id (a later send of the run replaces the earlier) as a gzipped file in
`HK_REPLAY_DIR` (the `replays` docker volume, `/data/replays`), for 15 days, at most 2 GB; without
`HK_REPLAY_DIR` in memory. `npm run replays -- --collected=200` reads them.

The client side is `client/src/net/` (`Backend`: queue, flush every 20 s and on hide, best
effort) and `client/src/ui/boardPanel.ts` (the Ranks button on the lobby's chapter card). A run
goes on a board only when no dev URL switch bends the rules (`rankedRun` in `game/scene.ts`).
Development builds stay offline unless `?api=http://localhost:8080`; WeChat stays offline
until the backend has an ICP-filed domain on the mini-game's request whitelist.

## Storage

MongoDB Atlas, a cluster of its own (`cluster0.qcp0r96`, not daydayup's), database `holykicker` (`HK_MONGO_DB`):
`events` (TTL 90 days; `perf` and `anomaly` ones go after 28 days, `PERF_KEEP_DAYS`, by a weekly prune: `Store.prune` in src/store.ts, looked at a minute after start and every 6 hours, and run when the last run, kept in `meta`, is 7 days old), `installs` (one per install, src/players.ts: first day, host, first build, the days it came back, its day 0 and its way to each board's first clear, folded as batches arrive), `active` (install per day), `best` (one
per install per board), `challenge` (one per install per challenge board: pending with its replay until re-simulated, then entered with its pick timeline; no TTL yet), `names` (one per named install, by tag: a portal name or a dice name), `reports` (TTL 180 days), `meta` (bookkeeping: when the prune last ran). Without `HK_MONGO_URI` the server keeps everything in memory
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

The corgi reskin shares this backend (docs/reskin.md "Builds"): its builds name themselves on
every request (`game: 'corgi'`, `src/game.ts`), the server keeps the tag on what it stores (Holy
Kicker's documents carry none) and gives the corgi boards of its own (`c3-corgi`). The dashboard
picks the game; `GET /v1/stats?game=corgi` reads the corgi's numbers, Holy Kicker's when not given.

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
