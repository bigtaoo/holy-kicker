# Lobby art (2026-10-06)

## Icons

Text-to-image from the `*.txt` prompts here, in the same sticker style as the build icons
(`art/monk/icons/README.md`, whose findings apply: "a single object, no people", nothing about
the game). `gen_all.sh` generates every icon whose image is missing. They are packed after the
training icons into the one icon sheet:

    python tools/pack_icons.py client/public/art/icons <art/monk/icons ... train_revive.jpg> \
      art/monk/ui/{jade,copper,shop,codex,lock,settings,patrol,tasks,chest,daily,tab_train}.jpg \
      art/monk/icons/{bomb,knives,talisman}.jpg art/monk/ui/dice.jpg

- `jade`, `copper`: the currencies in the lobby's top bar. The first jade, a rounded teardrop
  (`r1/jade_drop.jpg`), reads a little like a water drop; the second, a cushion cut with a vein
  (`r1/jade_cracked.jpg`), came out cracked; the third, from `jade.txt`'s classic brilliant cut
  (`r1/jade_brilliant.jpg`, 2026-10-07), is a mosaic of tiny gradient facets with a thin outline
  that turns to mush at top-bar size. Two more from `r1/*.txt` the same day: an oval cabochon
  (`r1/jade_oval.jpg`) is a wide pale lozenge, like soap, and a bi disc with a hole
  (`r1/jade_bi.jpg`) reads as a tyre or washer and, round with a hole, too close to the copper
  coin. `jade.jpg` stays a copy of the teardrop.
- `shop` (a red money pouch) and `codex` (a stitched book) are the Shop and Codex tabs; the
  others reuse the build icons: Gear the robe, Play the cuju. Train first reused the attack
  training's grey dumbbell, the one cold metal thing among warm painted objects; since 2026-10-21
  it has `tab_train`, a wooden training post with a red band (`r3/tab_train_b.jpg`; the first
  try, `r3/tab_train_mannequin.jpg`, was a thin mannequin that read as a person).
- `lock` replaces the 🔒 emoji, which every platform draws differently. `settings` replaces the ⚙
  glyph. A warm wooden cog with a red lacquer ring was tried on 2026-10-21 (`r4/settings_wood.jpg`
  from `r4/settings.txt`): its red middle read as a flower on the dark button, so the steel cog
  stayed.
- `dice` (2026-10-21): the honey-wood die beside the player's name, which rolls a new name; it
  replaced a die drawn in code.
- `patrol` and `tasks` (a ticked list on a notice board) sit on the Play tab's left rail. Patrol
  was a straw hat (`r4/patrol_hat.jpg`), the thinnest icon on the sheet and a thing worn, not a
  trip; since 2026-10-21 it is a traveller's cloth bundle hung from a pole (`r4/patrol_b.jpg`).
  The other tries: `r4/patrol_a.jpg` came out as two crossed sticks with dollar coins,
  `r4/patrol_c.jpg` a sack with cash coins that stands like the shop's pouch.
- `daily` (a gold trophy on a red lacquer base, 2026-10-21): the daily challenge's button on the
  Play tab's right rail, which until then borrowed the Lotus Steps spell icon.
- `chest` (red lacquer, gold bands): the chapter card's five progress chests. It came with a
  white sticker border, which the cutout removes along with the background.

`tasks` and `chest` were rate-limited on every key on 2026-10-06 and generated on 2026-10-07.

Closed shapes seeded as background in `tools/pack_icons.py` (`HOLES`): the coins' square hole,
the padlock's shackle and the cog's middle.

## Backdrop

`bg_lobby.png` is the lobby's painted temple courtyard behind the tabs, saved as
`client/public/art/ui/lobby.jpg` (JPEG quality 82, about 115 KB). edit_image keeps the input's
shape, so `bg_ref.png` is a rough 9:16 layout drawn in code (sky, mountains, a hall, a paved
courtyard). The first edit (`r1/bg_lobby_flat.png`) kept the blocks too literally, as flat vector
shapes; `bg_lobby.png` is an edit of that one with a prompt that lists the details (lanterns, an
incense burner, a stone lantern, framing trees, the warm lit door).

Round 2 (2026-10-21, `r2/`): the night picture read dark and muddy behind the tabs, so the
courtyard was repainted in daylight (`r2/bg_lobby_day.png`, now `bg_lobby.png`) and at dusk
(`r2/bg_lobby_gold.png`, not used); the old one is kept as `r2/bg_lobby_night.png`. The prompts
are beside them. The lobby no longer lays a dark veil over the picture.
