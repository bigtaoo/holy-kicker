# Build icons (2026-10-02)

One icon per item id (the relic, 5 spells, 6 passives), for the HUD build strip and the
level-up cards. Text-to-image from the `*.txt` prompts here; `ball.jpg` is the cuju from
`art/monk/rig/cuju_v1.jpg`. Packed with

    python tools/pack_icons.py client/public/art/icons ball.jpg palm.jpg ... wrath.jpg

into `client/public/art/icons/icons.{png,json}` (128 px cells, 256-colour palette, 62 KB).

The staff (2026-10-02): `staff_world.jpg` is the in-world sprite (`python tools/cutout.py
art/monk/icons/staff_world.jpg client/public/art/staff.png 400`); `staff.jpg`, the icon, is the
same image turned 45 degrees, so both look alike (the diagonal render, `r1/staff_spear.jpg`,
came out like a spear). Packed after `ball.jpg`.

The wooden fish (2026-10-02): `fish_world.jpg` is both the in-world sprite (`python
tools/cutout.py art/monk/icons/fish_world.jpg client/public/art/fish.png 200`) and the icon
(`fish.jpg` is a copy, packed after `staff.jpg`). The prompt with a mallet leaning on it
(`fish.txt`) came out as a sad pumpkin with a stick, so the icon is the fish alone.

The prayer beads (2026-10-03): `beads.jpg` is the icon, packed last. The in-world beads are drawn
in code (`client/src/game/beadsView.ts`: an outlined disc, cel shadow, highlight). The first try
(`r1/beads_on_drum.jpg`) had a broken prompt and put the beads on a drum; the prompt now also
says "nothing under them".

Findings:
- The first round (`r1/`) said "for a kung-fu monk roguelite" and every icon came back with a
  monk holding or standing next to the object. The prompt must say "a single object, no people,
  no person, no character, no body" and leave the game's theme out.
- The sticker look (thick outline, white sticker border) matches the figures; cutout removes the
  white border with the background.

The alms bowl and Karma (2026-10-03): `bowl.jpg` and `karma.jpg`, packed after `beads.jpg`. The
thrown bowl in the world is drawn in code (`client/src/game/bowlView.ts`). Karma first came out
as a lotus (`r1/karma_lotus.jpg`), too close to Calm Mind's lotus on the HUD, so it is a red
Chinese knot (a bond of fate) instead.

The sutra spells and Focus (2026-10-03): `lotus.jpg` (Lotus Steps), `halo.jpg` (Halo Beam),
`roar.jpg` (Lion's Roar) and `focus.jpg`, packed after `karma.jpg`. Lotus Steps is a lotus seed
pod, since Calm Mind is already a lotus flower; the first pod seen from the side
(`r1/lotus_melon.jpg`) read as a melon, so the prompt asks for its flat top. The first halo
(`r1/halo_thin.jpg`) was a thin ring with faint rays. The seeds, beams and roar in the world
are drawn in code (`client/src/game/sutraView.ts`).

The gear slot items (2026-10-04): `pendant.jpg`, `bracers.jpg`, `robe.jpg`, `sash.jpg` and
`sandals.jpg`, packed after `focus.jpg`; they replace the code-drawn placeholders in
`client/src/ui/gearIcons.ts`. The first pendant (`r1/pendant_ball.jpg`) had no hole and read as
a glass bauble; the prompt now asks for a ring with the background showing through. The sash
is a brown belt, since Karma is already a red knot. The pendant's hole and the belt's loop are
closed shapes, so `tools/pack_icons.py` seeds them as background (`HOLES`).

The shop's chests (`chest_free`, `chest_ad`, `chest_jade`): prompts here; only
`chest_free.jpg` came out before Mistral rate-limited, so none is packed yet and the shop
draws its placeholder (`lobbyEconomy.ts` falls back when the sheet lacks `chest_<kind>`).
Pack them after `sandals.jpg` once all three exist.
