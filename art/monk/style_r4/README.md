# Style round 4: five more mobs, style consistency in volume

Same five mobs drawn two ways, then compared with `tools/lineup_test.py`
(lineup + phone-size crowd on grass, numbers below).

- `mob_*` — text-to-image, the r3 style prompt plus a character line.
- `ref_*` — `edit_image` on `style_r3/enemy_jiangshi_fix.png`: "replace the character, keep
  exactly the same art style" (prompt files `ref_*.txt`).

| | outline | sat | notes |
|---|---|---|---|
| jiangshi (reference) | 1.30 % | 0.27 | |
| text-to-image | 0–1.8 % | 0.05–0.58 | skeleton on a grey card, water ghost in a puddle with red drips, bat oversized, fine hair |
| from reference | 1.0–1.65 % | 0.13–0.28 | all on white, same outline, palette and proportions |

Findings
- Text-to-image drifts in background, props, outline and detail level; usable only one at a time.
- Drawing from the jiangshi keeps the style, but also copies its face and robe: the paper doll
  came back as a bald jiangshi in a grey robe. Each type needs its own silhouette and one
  signature trait stated strongly (shape first, colour second).
- At equal height, wide mobs (bat, fox) read much heavier in the crowd; size mobs by opaque
  area, not height.
- Brown belts/spear shafts are low saturation and pass the warm check; the lantern's red mouth
  pushes it to 5.5 % warm pixels.
