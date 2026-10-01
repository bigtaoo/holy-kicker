# Boss: the fallen abbot (art item 5)

Drawn with `edit_image` from the hero's A-pose (`rig/hero_apose_v3.png`), "replace the
character, keep the art style and the A-pose", so the rig gets the same framing and outline.

| | file | notes |
|---|---|---|
| A | `boss_apose_a.png` | purple robe, iron bracers; the robe is the enemy-attack violet, so bullets fired from his body melt into it |
| B | `boss_apose_b.png` | **picked**: teal torn robe, barrel body, skull bead; the cold palette is shared with the horde, but the size, grey skin and red eyes set him apart |

`compare_ab_crowd.png`: both at phone scale (boss 280 units) in a crowd with violet bullets.
Style numbers (tools/lineup_test.py): outline 1.11-1.32 %, saturation 0.24-0.26, the same band as
the jiangshi (1.30 %, 0.27).

Pipeline
- `tools/recolor_warm.py` turned B's yellow teeth and glowing eye cores cold off-white (red stays)
  -> `boss_v1.png`; the grey ground shadow was painted out.
- `parts_v1.json` -> `parts_v1/` (11 parts: legs, skirt + middle flap, torso, beads, head with
  beard, arm and fist per side). The sleeves are fused with the body in the drawing, so the torso
  gets rounded hidden shoulders; without them raised arms showed a square cut.
- `rig_v1.json` + `boss_tao.json` -> `boss_monk.tao` and `client/public/art/boss_monk/`
  (scale 0.55, 283 KB). Clips: idle, walk (heavy waddle), slam (crouch, fists overhead, smash at
  1.0 s), hurt.

In game (`client/src/game/boss.ts`, `bossView.ts`): 300 units tall (`?bosssize=`, `?boss=0`
turns him off), walks after the hero, then winds up a slam on a violet circle (the enemy-attack
look) for 1 s; the raised fists are the second tell. Hit flashes pale blue, not red. The kick
locks onto the boss when in range. A violet health bar with his name sits across the top.

In-game captures: `ingame_windup.png` (150 mobs, the circle mid wind-up), `ingame_walk_slam.png`
(top: walk cycle, bottom: wind-up to impact; taken before the shoulder fix).
