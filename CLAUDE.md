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
  build and the 4 MB main-package gate.
- Keep game logic that can be pure (viewport math, movement, horde steps, buff stacks) free
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

- `client/` — the game (Vite). `src/main.ts` web entry, `src/main.wechat.ts` WeChat entry,
  `src/platform/{web,wechat}` host adapters, `src/game` game code.
- `client/wechat/` — the WeChat DevTools project; `npm run build:wechat` writes `js/` and
  `art/` into it.
- `client/public/art/` — shipped sprites (exported by `tools/cutout.py`).
- `art/` — source art and style exploration; `tools/` — art scripts.
- `build/` — check scripts.
