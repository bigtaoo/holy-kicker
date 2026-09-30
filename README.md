# Holy Kicker

A portrait horde-survivor roguelite: a goofy bald monk kicks a cuju ball and swings prayer
beads, wooden fish and a staff at hordes of jiangshi and fox spirits. Built with PixiJS for
CrazyGames / Poki and the WeChat mini-game.

## Running

```bash
npm install
npm run dev            # web, http://localhost:5174 (WASD / arrows or drag to move)
npm run build:wechat   # then open client/wechat in WeChat DevTools
npm run check          # typecheck, file length, tests, WeChat build + 4 MB gate
```

## Layout

- `client/` — the game. See `CLAUDE.md` for structure and rules.
- `art/` — source art and exploration
  - `hero/` early archer pipeline test (shelved)
  - `monk/style_r1..r3/` monk style rounds; round 3 is the locked direction
- `tools/` — art scripts
  - `generate_image.sh <out> <prompt file>` — Mistral text-to-image
  - `edit_image.sh <in> <out.png> <prompt file>` — Mistral image edit
  - `cutout.py <in> <out.png> <height>` — cut out the white background, export at game size
  - `scene_test.py` / `portrait_test.py` — crowd readability tests (phone, small desktop
    iframe, desktop fullscreen)
  - `scale_test.py` — multi-size scale test

## Credentials

The image scripts read keys from `~/.vibe/mistral_curl_key{A,B}.conf`; `MISTRAL_KEY=A|B`
picks one (default B). Keys never go in this repository.
