# Chapter 2 (misty marsh) mobs

Drawn with `tools/edit_image.sh` from `style_r3/enemy_jiangshi_fix.png` ("replace the
character, keep exactly the same art style"), prompts in the `.txt` files next to them, then
baked by `tools/bake_mob.py` from the specs one folder up (`waterghost`, `toad`, `toad_king`,
`carp`.json).

- `waterghost_v1.png` — `style_r4/ref_waterghost.png` with its yellow teeth and eye cores made
  cold and the ground shadow removed (`waterghost_fix.txt`).
- `carp_v1.png` came out facing right: `carp_v1_left.png` is it mirrored, `carp_v2.png` that
  with the eye cores pulled cold by `tools/recolor_warm.py` (box 150 180 480 340, hue 11–40);
  a red-orange ring is left.
