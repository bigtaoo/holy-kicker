# Corgi bosses

The corgi theme's two skeletal bosses. They keep the monk bosses' animation, slot and image
names (bossView and demonView play them unchanged); parts and pivots are their own.

| Folder   | Boss          | Replaces (game key)                                  |
| -------- | ------------- | ---------------------------------------------------- |
| `titan/` | Titan Beetle  | `art/boss_monk/{atlas.png, atlas.webp, skeleton.json}` |
| `mecha/` | Mecha-Biscuit | `art/ch5/demon/{atlas.png, skeleton.json}`            |

The finished files sit at `art/reskin/corgi/game/<key>`, for `client/themes/corgi.json`.

## Titan Beetle

- `ref.png` the concept, `apose.txt` the prompt for the redraw, `apose_a.png` the redraw,
  `apose_clean.png` the same with the ground shadow whited out.
- `parts_spec.json` cuts it into hind legs, front legs (upper and fore), torso, head and
  antennae (mirrored at x=1190); `rig.json` hangs them on the torso.
- `titan_tao.json` holds the clips. Every key that moves the torso moves the hind legs
  back by the same amount, so the claws stay planted. 'slam' rears up and smashes at t=1.0
  (BOSS.windup).

## Mecha-Biscuit

The hero's own A-pose (`../apose2.png`) in cold armour:

- `face.txt` / `face_a.png` the redrawn evil face; `gun.png` / `gun_n.png` the guns,
  recoloured once.
- `parts_spec.json` and `rig.json` are the hero's cut with the head renamed `face`.
- Body parts recoloured with `tools/recolor_mecha.py` (`--mode armour`, or `fur` for the
  furred parts). Recolour each drawing once only: its red glow counts as warm.
- `face_hurt` and `face_strain` are aliases of `face` (pack_tao `aliases`), since the
  demon view swaps them in.

## Build

```
python tools/split_parts.py art/reskin/corgi/bosses/titan/parts_spec.json art/reskin/corgi/bosses/titan/parts
python tools/clean_parts.py art/reskin/corgi/bosses/titan/parts --blob torso:44,54 --blob ant_l:98,282 --blob ant_r:9,281
python tools/pack_tao.py art/reskin/corgi/bosses/titan/titan_tao.json <tmp>/titan.tao <out dir>
python tools/webp.py <out dir>/atlas.png
```

and the same for `mecha/` (no blobs; no webp: the demon's atlas has none). `clean_parts.py` fills
the holes the cut left inside a part, repaints the stray white tooth tip and red eye glow (the
blob seeds, in a freshly split part's pixels) and takes the light fringe off the soft edges, which
the runtime sticker outline showed as a pale ring. Copy `atlas.png`,
`skeleton.json` (and `atlas.webp`) to the game key folder above.
