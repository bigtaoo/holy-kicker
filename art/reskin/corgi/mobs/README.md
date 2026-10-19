# Corgi theme: chapter 1–2 bugs

The bugs that stand in for the monk's mob sheets (docs/reskin.md has the cast). Each is one
drawing, cleaned up, then baked by `tools/bake_mob.py` from the spec of the same name into
`../game/art/mobs/`, under the monk sheet's name so the game reads it unchanged:

| spec | bug | sheet | notes |
|---|---|---|---|
| `beetle.json` | Beetle Drone | `jiangshi` | ch1 chaser; also the tinted Ram Beetle elite and the fallback |
| `tick.json` | Skitter Tick | `fox` | runner; drawn facing right like the fox |
| `worm.json` | Burrow Worm | `waterghost` | ch2 chaser and emerger |
| `spitter.json` | Spitter | `toad` | ch2 shooter |
| `brood.json` | Brood Mother | `toad_king` | ch2 elite, elite rim baked in |
| `bogworm.json` | Bog Worm | `carp` | ch2 boss, no flash copies |

`jiangshi_soft.png` is `python tools/soften_mob.py ../game/art/mobs/jiangshi` after the bake.

## Sources

`beetle`, `tick`, `worm`, `spitter` and `brood` `_v1.png` were drawn with
`tools/generate_image.sh <out> <prompt.txt>` from the `.txt` prompts here; `bogworm_v1.png` is
`../../r2/boss_worm.png`. The `_v2.png` files are the cleaned ones:

- `beetle_v2.png` — `tools/clear_ground.py beetle_v1.png … 560` (the pale ground shadow closed
  off the paper between the legs), then `tools/recolor_warm.py … 200 180 720 420` (eye cores).
- `tick_v2.png` — `tick_v1.png` lightened (value raised to the power 0.6, saturation × 0.85
  above value 0.25), since the game multiplies the runner by the fox's purple tint.
- `worm_v2.png` — `recolor_warm.py worm_v1.png … 380 120 700 360` (eye cores and teeth).
- `spitter_v2.png` — `recolor_warm.py spitter_v1.png … 160 330 470 430`.
- `brood_v2.png` — `recolor_warm.py brood_v1.png … 140 225 515 340`.
- `bogworm_v2.png` — `recolor_warm.py bogworm_v1.png … 360 130 540 230`.

The mud, puddles and shadows the drawings stand on go in the bake: a `drop` rule erases paint of
the ground's colours below a line where it touches the outside (the body's dark outline keeps
the same colours inside it), and `"islands": true` then drops the ground's leftover outline
bits. The Brood Mother's enclosed paper between its right legs is cleared with `holes`.
