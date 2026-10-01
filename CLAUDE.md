# Holy Kicker — working rules

Portrait-only horde-survivor roguelite in PixiJS v8, shipping to CrazyGames / Poki (web)
and the WeChat mini-game. The client setup is adapted from the sibling project
`D:\daydayup`; look there first before inventing platform plumbing (WeChat adapter,
CrazyGames SDK, skeletal animation runtime and editor in `tools/animator`).

## Rules

- **English everywhere** in code, comments, docs and commit messages.
- **Source files stay at or under 500 lines** (`npm run check:filelength`). Split by
  responsibility instead of raising the limit.
- **`npm run check` must pass before every commit**: typecheck, file length, tests, WeChat
  and CrazyGames builds and the 4 MB main-package gate.
- **No literal player-facing text in code**: every string goes through `t()` and the tables
  in `client/src/i18n/` (en is the source, zh must match key for key). Balance numbers live
  in `client/src/meta/balance.json`, never in code.
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
  height); desktop web widens to at most 3:4 and zooms in 1.3x (`client/src/game/viewport.ts`).
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
  upload) and `src/main.wechat.ts`, all through `src/boot.ts`; `src/platform/{web,crazygames,wechat}`
  host adapters (storage, ads, portal hooks); `src/game` the run; `src/ui` the shell, lobby,
  results and HUD; `src/meta` save, progress and balance; `src/i18n` string tables.
  Dev URL switches: `?direct` skips the lobby, `?ads=fake` fakes an ad host.
- `client/wechat/` — the WeChat DevTools project; `npm run build:wechat` writes `js/` and
  `art/` into it.
- `client/public/art/` — shipped sprites (exported by `tools/cutout.py`).
- `art/` — source art and style exploration; `tools/` — art scripts.
- `build/` — check scripts.
