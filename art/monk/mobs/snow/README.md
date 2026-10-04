# Chapter 3 (snow pass) mobs

Drawn with `tools/edit_image.sh` from `style_r3/enemy_jiangshi_fix.png` ("replace the
character, keep exactly the same art style"), prompts in the `.txt` files next to them, then
baked by `tools/bake_mob.py` from the specs one folder up (`wolf`, `wolf_leader`,
`icewraith`, `skeleton`, `shard`, `witch`.json).

- `*_v1.png` are the drawings as generated; every one had warm touches (yellow teeth, bone,
  eye cores, the witch's crown). `*_v2.png` have the hues 13–40 pulled to a cold blue-grey,
  and are what the specs bake.
- The chapter's chasers are no new drawing: the jiangshi tinted ice blue in the game.
- The witch sheet (12 frames, 337x403) is the largest mob sheet with the carp's; both are
  palette PNGs like every baked mob.
