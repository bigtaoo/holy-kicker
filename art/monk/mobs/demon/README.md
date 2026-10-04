# Chapter 5 mobs and boss: Demon Peak (2026-10-04)

- **Fallen monk** (`monk.txt`, the shielder: a gong held toward the hero) and **shadow**
  (`shadow.txt`, the runner) drawn with `tools/edit_image.sh` from
  `art/monk/style_r3/enemy_jiangshi_fix.png`. `*_v1.png` are as generated, `*_v2.png` have the
  yellow eye cores pulled cold by `tools/recolor_warm.py`; the specs one folder up
  (`monk.json`, a waddle with the gong swaying; `shadow.json`, a gallop with the smoke and tail
  waving, its ground shadow dropped) bake them with `tools/bake_mob.py` into
  `client/public/art/ch5/mobs/`, the chapter's WeChat subpackage.
- **Inner Demon**: no new picture. `tools/recolor_cold.py client/public/art/hero/atlas.png
  client/public/art/ch5/demon/atlas.png --turn 170 --dark 0.62` turns the hero's warm hues
  (robe, skin, beads) steel blue and grey and darkens everything; `skeleton.json` is the
  hero's, copied. A violet turn (the default 235) clashed with the enemy-attack violet.
  Rerun both after any change to the hero's rig.
