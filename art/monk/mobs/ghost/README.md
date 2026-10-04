# Chapter 4 (ghost market) mobs

Drawn with `tools/edit_image.sh` from `style_r3/enemy_jiangshi_fix.png` ("replace the
character, keep exactly the same art style"), prompts in the `.txt` files next to them, then
baked by `tools/bake_mob.py` from the specs one folder up (`tongue`, `lantern`, `effigy`,
`doorgod`, `judge`.json) into `client/public/art/ch4/mobs`, the chapter's WeChat subpackage.

- `*_v1.png` are the drawings as generated, `*_v2.png` the ones the specs bake (the effigy
  bakes its `_v1`, it had nothing warm): warm hues
  (eye cores, the lantern's flame, the door god's trim) pulled cold by `tools/recolor_warm.py`.
- The judge's drawing came back with a western top hat (`judge_v0.png`) and the retries were
  rate-limited, so `judge_cap.py` paints the official's black gauze cap with its two flat
  wings over it (`judge_v1.png`); `judge_v2.png` then has the brush handle and boots
  (hues 11-40) cooled. The prompt in `judge.txt` asks for the cap if it is ever redrawn.
- The judge's sheet is 12 frames of 385x406, like the witch's; the empowered witch of this
  chapter's wave 25 reuses her chapter 3 sheet, tinted.
