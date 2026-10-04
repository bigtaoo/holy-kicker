# Chapter 5 mobs and boss: Demon Peak (2026-10-04)

- **Fallen monk** (`monk.txt`, the shielder: a gong held toward the hero) and **shadow**
  (`shadow.txt`, the runner) are to be generated like chapter 4's mobs: `tools/edit_image.sh`
  from `art/monk/style_r3/enemy_jiangshi_fix.png`, then baked with `tools/bake_mob.py` into
  `client/public/art/ch5/mobs/`. Generation was rate-limited, so the sheets there now are
  stand-ins from `standin.py`: the fox sheet mirrored and turned to dark violet smoke (the
  shadow), the jiangshi sheet with its teal turned slate violet (the monk). Delete
  `standin.py` once the real sheets are baked.
- **Inner Demon**: no new picture. `tools/recolor_cold.py client/public/art/hero/atlas.png
  client/public/art/ch5/demon/atlas.png --turn 170 --dark 0.62` turns the hero's warm hues
  (robe, skin, beads) steel blue and grey and darkens everything; `skeleton.json` is the
  hero's, copied. A violet turn (the default 235) clashed with the enemy-attack violet.
  Rerun both after any change to the hero's rig.
