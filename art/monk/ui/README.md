# Lobby art (2026-10-06)

## Icons

Text-to-image from the `*.txt` prompts here, in the same sticker style as the build icons
(`art/monk/icons/README.md`, whose findings apply: "a single object, no people", nothing about
the game). `gen_all.sh` generates every icon whose image is missing. They are packed after the
training icons into the one icon sheet:

    python tools/pack_icons.py client/public/art/icons <art/monk/icons ... train_revive.jpg> \
      art/monk/ui/{jade,copper,shop,codex,lock,settings,patrol,tasks,chest}.jpg

- `jade`, `copper`: the currencies in the lobby's top bar. The first jade, a rounded teardrop
  (`r1/jade_drop.jpg`), reads a little like a water drop; the second, a cushion cut with a vein
  (`r1/jade_cracked.jpg`), came out cracked. `jade.jpg` is a copy of the teardrop for now;
  `jade.txt` asks for a classic brilliant cut, still to generate (delete `jade.jpg` first).
- `shop` (a red money pouch) and `codex` (a stitched book) are the Shop and Codex tabs; the
  others reuse the build icons: Gear the robe, Play the cuju, Train the dumbbell.
- `lock` replaces the 🔒 emoji, which every platform draws differently. `settings` replaces the ⚙
  glyph.
- `patrol` (a straw hat) and `tasks` (a ticked list) sit on the lobby's two buttons under PLAY.
- `chest`: the chapter card's five progress chests.

Not generated yet (every key was rate-limited, 2026-10-06): `tasks` and `chest`. The code
falls back without them (the Tasks button has no picture, the chests are drawn boxes); run
`gen_all.sh` and repack.

Closed shapes seeded as background in `tools/pack_icons.py` (`HOLES`): the coins' square hole,
the padlock's shackle and the cog's middle.

## Backdrop

`bg_lobby.png` is the lobby's painted temple courtyard behind the tabs, saved as
`client/public/art/ui/lobby.jpg` (JPEG quality 82, about 70 KB). edit_image keeps the input's
shape, so `bg_ref.png` is a rough 9:16 layout drawn in code (sky, mountains, a hall, a paved
courtyard). The first edit (`r1/bg_lobby_flat.png`) kept the blocks too literally, as flat vector
shapes; `bg_lobby.png` is an edit of that one with a prompt that lists the details (lanterns, an
incense burner, a stone lantern, framing trees, the warm lit door).
