# Monks: the fat monk and the little novice

Both drawn with `edit_image` from the hero's A-pose (`../rig/hero_apose_v3.png`): "replace the
character, keep the art style, the A-pose and the framing" (prompts `fat_apose.txt`,
`novice_apose.txt`), so they split onto the hero's 19 bones and play his clips.

| | source | notes |
|---|---|---|
| fat | `fat_v1.png` | red-brown robe, saffron sash, bare pot belly, earring; the robe hides the legs, so thigh and shin are the trouser strips under the hem, swung from a hip pivot up inside the robe |
| novice | `novice_v1.png` | cream robe, red sash; no beads, so his clips drop the `beads` keys |

Pipeline (`python make_tao.py` here):
- `<monk>_parts.json` -> `<monk>_parts/` (tools/split_parts.py). Hidden fills behind the shoulders,
  the beads and the sash keep the seams shut when the joints turn; `novice_poses.png` and
  `fat_poses.png` are tools/pose_test.py checks of the run and kick extremes.
- Faces: `<monk>_head.png` (a 400 px crop of the head) redrawn with `face_hurt.txt` and
  `face_strain.txt` -> `<monk>_face_*_v1.png`, aligned by tools/face_variant.py. A missing one
  falls back to the plain face.
- `<monk>_tao.json` (written by make_tao.py from `../rig/hero_tao.json`) -> `<monk>.tao` and
  `client/public/art/monks/<monk>/`, the `monks` art pack (WeChat subpackage). Scale 0.35, the
  novice 0.32; in the run the novice is 88 % of the hero's height (Game.ts MONK_HEIGHT).
- Portraits for the lobby: `monk_<id>.png` -> `client/public/art/icons/monks.png`
  (`python tools/pack_icons.py --cell 256 --name monks client/public/art/icons monk_kicker.png monk_fat.png monk_novice.png`).
