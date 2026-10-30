# Holy Kicker — working rules

Portrait-only horde-survivor roguelite in PixiJS v8, shipping to CrazyGames / Poki (web)
and the WeChat mini-game; an iOS app (Capacitor, Game Center, AdMob, one ad-free purchase) is
planned in `docs/ios.md`, reusing `D:\funny`'s native shell. The client setup is adapted
from the sibling project `D:\daydayup`; look there first before inventing platform plumbing
(WeChat adapter, CrazyGames SDK, skeletal animation runtime and editor in `tools/animator`).

## Rules

- **English everywhere** in code, comments, docs and commit messages.
- **Source files stay at or under 500 lines** (`npm run check:filelength`). Split by
  responsibility instead of raising the limit.
- **`npm run check` must pass before every commit**: typecheck, file length, tests, WeChat,
  CrazyGames and iOS web builds, the 4 MB main-package gate and a scan that no release bundle
  reads a dev URL switch (`check:releaseswitches`).
- **Coverage only ratchets up**: check runs the tests as `npm run coverage` (about 10 s more), which fails when a
  workspace's or a `client/src/<dir>`'s line coverage drops over 0.5 points below `build/coverage-floors.json`;
  after adding tests, `npm run coverage -- --update` raises the floors (never lowers them) — commit it.
  Client tests run on a pinned day and seeded `Math.random` (`client/src/testkit/seedRandom.ts`), so a run
  covers the same lines on every machine and in every challenge week; tests may take 60 s (`build/coverage.mjs`).
- **No literal player-facing text in code**: every string goes through `t()` and the tables
  in `client/src/i18n/` (en is the source, zh must match key for key; a word that names the
  game's world goes into both themes' tables, `i18n/monk/` and `i18n/corgi/`, not the shared
  ones). Balance numbers live in `client/src/meta/balance.json`, never in code.
- **Game logic lives in `engine/` (`@hk/engine`)**: a deterministic simulation at a fixed
  30 Hz on integer state, fed only by player commands, so it can run in lockstep online later.
  Follow `engine/README.md` (integers only, no `Math.sin/sqrt/random`, no clocks, no imports
  from outside the engine). The client only draws the sim state (interpolated between ticks)
  and reacts to its events.
- Keep view-side logic that can be pure (viewport math, animation timing, effect pools) free
  of Pixi and browser APIs, and test it next to the source as `*.test.ts`.
- Committing directly to `main` is fine for now; no daily-branch flow.

## Fixed decisions

- Logical resolution 1080x1920. Phones and WeChat are pure 9:16 (taller phones see more
  height). Web hosts on a screen at least 1.2x wider than tall (desktops, a tablet on its side) play in
  landscape: a run's `RunConfig.wide`, a 16:10 to 16:9 play area showing 1200 world units high, the UI
  laid out in at least 2560x1440 units (so a short 16:9 window's text stays readable), spread over the
  bars down to a 4:3 frame (2560x1920 on a tablet on its side) (`client/src/game/viewport.ts`, `ui/uiLayout.ts`,
  `ui/hudLayout.ts`, `ui/lobbyLayout.ts`); squarer desktop windows keep the 3:4 portrait frame zoomed
  1.3x. iOS and WeChat stay portrait; only a phone on its side is asked to turn. Every screen needs both layouts.
- In-world sizes (logical units): hero 120, mob 80, elite 130; UI text at least 48.
- Art: thick-outline sticker style, flat colours, one hard cel shadow. Hero is warm
  (saffron/gold), enemies are cold (teal/purple/grey) with red eyes; no saturated warm
  colours on enemies.
- Hero and bosses use cutout skeletal animation; mobs use baked frame sequences.
- Buffs are a data-driven modifier stack.

## Layout

- `engine/` — the simulation (`@hk/engine`, consumed as source; see `engine/README.md`).
- `client/` — the game's view and hosts (Vite). Entries `src/main.ts` (web dev),
  `src/main.crazygames.ts` (`npm run build:crazygames` → `client/dist-crazygames/`, the zip to
  upload), `src/main.playgama.ts` (`npm run build:playgama` → `client/dist-playgama/`, zipped with
  `index.html` at the root for the Playgama console by Python's zipfile, files only (a `Compress-Archive` zip fails its Bridge check); saves, ads and pause through Bridge v2),
  `src/main.gamedistribution.ts` (`npm run build:gamedistribution:new` → `client/dist-gamedistribution-new/`, GD's own SDK,
  offline: no backend, no links; docs/design.md "Platforms, saves and server"),
  `src/main.wechat.ts` and `src/main.ios.ts` (`npm run build:ios` → `client/dist-ios/`,
  which the Capacitor shell in `client/ios/` packages), all through `src/boot.ts`;
  `src/platform/{web,crazygames,playgama,gamedistribution,wechat,ios}` host adapters (storage, ads, portal hooks; WeChat ads and error reports: `docs/wechat-ads.md`); `src/game` the run; `src/ui` the shell, lobby,
  results and HUD; `src/meta` save, progress and balance; `src/audio` sound effects (cue table, procedural
  voices, rate limits and voice cap) and music (two crossfading decks); `src/i18n` string tables.
  Recorded sounds: picks in `art/audio/audition.html` (`tools/audio_audition.py`) →
  `art/audio/picks.json` → `python tools/audio_build.py` writes `client/public/audio/` (a WeChat
  subpackage); sources and licenses in `art/audio/SOURCES.md`. The corgi set: both tools with
  `--theme corgi` (`tools/audio_corgi.py`, `art/audio/corgi/`) write `art/reskin/corgi/game/audio/`.
  Dev URL switches (development builds only; a release reads none of them): `?direct` skips the lobby, `?ads=fake` fakes an ad host (and a grey box for the lobby banner), `?store=fake` the iOS ad-free card, `?notify=fake` its reminders (the card after a run, the settings switch), `?ota=fake` (or `fail`) its hot-update prompt in the lobby, `?waves=0` (or any
  `?mobs=`) runs the engine sandbox: a fixed horde and a hero who cannot die, for stress tests.
  `?wave=N` starts a chapter run at wave N (shrines on 5, 15, …; elites every 5th; mid-bosses 20 and 35), `?chapter=N` plays chapter N; `?relic=staff` (or `fish`, `beads`, `bowl`) plays
  the run with that relic whatever the save says; `?sutras` gives every run all four sutras;
  `?bare` plays without the stats from gear and training; `?hard` plays the run in hard mode;
  `?monk=fat` (or `novice`) plays as that monk whatever the save says; `?challenge` shows a daily
  and a weekly challenge made up on the device when offline (online the server's record wins);
  `?challenge=settle` treats the weeks in the save as closed, so their reward card shows now.
  `?arm=first20:short` puts the save in that experiment arm whatever the table says (`docs/experiments.md`).
  `?autoplay` lets the balance bot play (`&from=N` rushes it to wave N first); `?record=SECONDS` records the run to a
  video (`&shape=landscape|portrait|phone|iphone`, `src/dev/recorder.ts`); store videos: `tools/record_video.mjs` → `tools/store_video.py` (`docs/store.md`).
- `server/` — the backend (`@hk/server`, server/README.md): analytics, leaderboards and problem reports (with a replay), and every run's replay while `COLLECT` in `src/replayShelf.ts` asks (`npm run replays -- --collected`) at
  hk.gamestao.com on daydayup's box; `src/protocol.ts` is the wire format, imported by the client
  as `@hk/protocol`. CI deploys it on every green push to `main` (`npm run deploy:server` by hand). Dev: `?api=http://localhost:8080` with
  `npm run dev -w server` (the client stays offline in development otherwise). The operator's dashboard
  is https://hk.gamestao.com/dash; how to read it and which levers move retention: `docs/retention.md`.
- `client/wechat/` — the WeChat DevTools project; `npm run build:wechat` writes `js/` and
  `art/` into it.
- `client/public/art/` — shipped sprites (exported by `tools/cutout.py`). The big ones listed in
  `client/src/webpArt.json` also ship a `.webp` twin (lossy for full-colour sheets, lossless for the palette ones a first run waits on) (`python tools/webp.py` after changing a PNG;
  `check:webp` fails on a missing or mis-sized one); web hosts load it when the browser decodes WebP, falling back
  to the PNG per file; WeChat ships PNG only.
- `client/themes/corgi.json` — the corgi reskin's asset list: one codebase, two art sets, never
  mixed in a build (`build/theme.mjs`, docs/reskin.md "Builds"). Every key is a file of
  `client/public`, mapped to the corgi's file or null while not drawn; `check:theme` keeps it in step
  (`-- --sync` after adding or removing public files). `npm run dev:new`; `npm run build:new` →
  h.gamestao.com/new/ and `npm run build:crazygames:new` fail until every entry is drawn. Corgi
  builds share hk.gamestao.com, tagged `game: 'corgi'` with boards of their own (`server/src/game.ts`),
  and keep their browser saves under `corgi:`.
- `art/` — source art and style exploration; `tools/` — art scripts.
- `build/` — check scripts. `npm run sweep:layout` (not in check) judges every screen's labels at phone,
  tablet and desktop sizes against `build/layout-baseline.json`; layout work may only shrink it (`docs/layout-sweep.md`).
- `.github/workflows/ci.yml` — `npm run check` on every push and PR; a green push to `main` ships
  the backend to hk.gamestao.com (`SERVER_DEPLOY_ENABLED`), then publishes the web build to
  h.gamestao.com (Cloudflare, `wrangler/web.jsonc`, `WEB_DEPLOY_ENABLED`) and the corgi build to
  h.gamestao.com/new/ (`wrangler/new.jsonc`, `NEW_WEB_DEPLOY_ENABLED`).
- `.github/workflows/release-ios.yml` — the iOS app, built only on the macOS runner (no Mac here):
  an unsigned compile on pushes that touch the shell; a tag `ios-v*` or a manual run signs it and
  uploads to TestFlight (`docs/ios.md`). It calls the reusable `ios-app.yml`, as does
  `release-ios-corgi.yml` for the corgi's own app, Corgi Commando (`com.gamestao.corgi`, tags
  `corgi-ios-v*`, `npm run build:ios:new`; `client/src/platform/ios/apps.json` holds each app's
  ids, `build/setIosApp.mjs` writes them over the shell in CI; docs/ios.md "Second app").
- `.github/workflows/ota-ios.yml` — a hot update of an iOS app's web layer (theme monk or corgi),
  run by hand: zips the iOS web build and deploys it with a manifest to the app's host, hk-ota.gamestao.com
  (`wrangler/ota.jsonc`) or the corgi's corgi-ota.gamestao.com (`wrangler/ota-corgi.jsonc`);
  shells fetch it once the game is up and switch at the next launch (`docs/ios.md` "Hot updates").
