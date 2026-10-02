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

Findings:
- The first round (`r1/`) said "for a kung-fu monk roguelite" and every icon came back with a
  monk holding or standing next to the object. The prompt must say "a single object, no people,
  no person, no character, no body" and leave the game's theme out.
- The sticker look (thick outline, white sticker border) matches the figures; cutout removes the
  white border with the background.
