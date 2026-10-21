# Corgi Commando art

The corgi theme's own pictures (docs/reskin.md). `client/themes/corgi.json` maps each file the
game loads to its source here; this README covers the planets, the UI art and the item
pictures, the files that are not a mob, hero, monk, boss or sound.

## Planets

One planet per chapter, each in its own colours. The bugs stay cold and the hero warm on all of them:

| Chapter | Planet | Ground (game file) | Props sheet |
|---|---|---|---|
| 1 | icy moon: frost dust, regolith paths | `ground/grass`, `earth`, `earth_soft` | `planets/deco_frost` |
| 2 | spore jungle | `ground/marsh` | `planets/deco_jungle` |
| 3 | desert dunes | `ch3/ground/snow` | `planets/deco_dune` |
| 4 | forge world: basalt with lava cracks | `ch4/ground/street` | `planets/deco_forge` |
| 5 | bug hive: resin honeycomb | `ch5/ground/cave` | `planets/deco_hive` |

The grounds are drawn in code, with no generated picture:
- `tools/planet_tile.py` draws frost, regolith, spore and dune.
- `tools/rock_tile.py --lava` draws the forge.
- `tools/hex_tile.py` draws the hive.

## Sheets

Each sheet is generated from the prompt next to it (`<name>.txt`, `tools/generate_image.sh`). It
holds several objects on white in a grid, and `tools/split_sheet.py` cuts the cells out.

- `icons/sheet_*`: the 44 icons in `art/icons/icons.png`.
  - `weapons`: the relics' and spells' main pieces.
  - `spells`, `passives`, `shop` and `lobby`. The first three came out in uneven rows and are
    cut with `auto`, which names the objects in reading order and skips the spares.
  - `relics`: bowl, cymbal and fish.
  - `fix`: iron, karma and sash, redrawn on their own after the first sheets missed them.
  - `arsenal`: the homing missile, grenade and combat knife (talisman, bomb, knives), also drawn in
    the world from their icon frames.
- `items/sheet_*`: the relic and spell pictures drawn in the world.
  - `tall`: staff, staff_ruyi, bell_relic, palm (a bomb drawn nose up, flipped to fall).
  - `round`: cuju, cuju_meteor, fish.
  - `big`: lion, mountain.
- `planets/deco_*`: six ground props per planet, named after the monk frames they replace.
- `ui/far.png`: the patrol panorama.
- `ui/props.png`: the patrol roadside props.
- `ui/bg_lobby.png`: the lobby. It is an edit (`tools/edit_image.sh`) of `ui/bg_ref.png`, a layout reference drawn in code, made with `ui/bg_lobby.txt`.

The cell order and frame names are in `tools/corgi_art.py`.

## Build

```
python tools/corgi_art.py            # every step; or name some: grounds deco icons items patrol lobby
```

This writes `game/<game path>`. Every file has the size, format and atlas frame names of the monk
file it replaces, plus a same-size WebP where `client/src/webpArt.json` lists one. A step whose
sheet is not there yet is skipped and named.

To try the pictures, point the entries of `client/themes/corgi.json` at `art/reskin/corgi/game/...`
and run `npm run dev:new` with `?chapter=N`.
