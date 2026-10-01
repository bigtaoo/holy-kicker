# Holy Kicker — in-run content

Status: agreed (2026-10-01). Companion to [design.md](design.md).
Names are working names; every name ships through the string table (en / zh-CN shown).

## Combat roles

- **Relic = the weapon.** Auto-fires, prefers elites and the boss, high single-target damage.
  It is the only way to kill elites quickly, so they force the player to position.
- **Spells clear the horde.** Area damage, deals **50 %** to elites and bosses *(tune)*.
- **Stillness** *(later, after the base loop is fun)*: standing still for 0.5 s enters *Zen*:
  relic attacks charge up (+50 % damage, bigger hit) while spells keep their normal timing.
  Moving drops it at once: a "move to dodge, stop to burst" rhythm.

## Build in a run

| Slot | Count | Levels | Source |
|---|---|---|---|
| Relic | 1 (chosen in the lobby) | 1–5, then awakening | Level-up cards |
| Spells | up to 4 | 1–5 each, then evolution | Level-up cards |
| Passives | up to 4 | 1–5 each | Level-up cards |

- Level-up: pick 1 of 3. Cards for full slots and maxed items stop appearing.
- About 30 level-ups plus 5 shrines per full run, against 45 picks to max everything, so
  not everything can be maxed and choices matter.
- **Evolution:** spell at level 5 + its paired passive (any level) → the next level-up offers
  the evolved form as a gold card. **Awakening** works the same way for the relic.
- First evolution of each pair is recorded in the Codex.
- Portrait readability: few, large slots. The HUD shows 9 icons at most.

## Relics (5)

Unlocked one per chapter clear (the cuju ball is the starter).

| Relic | en / zh-CN | Attack | Awakens with | Awakened |
|---|---|---|---|---|
| Cuju ball | Cuju Ball / 蹴鞠 | Kicked, bounces between 3 targets (implemented) | Arhat Legs | **Meteor Ball** / 流星鞠: splits into 3 on every bounce |
| Staff | Staff / 禅杖 | Close 180° sweep with knockback | Iron Head | **Ruyi Staff** / 如意禅杖: sweep grows to a full circle and longer reach |
| Wooden fish | Wooden Fish / 木鱼 | Each tap sends a sound ring around the hero | Calm Mind | **Stunning Bell** / 晨钟: every 4th ring stuns for 1 s |
| Prayer beads | Prayer Beads / 念珠 | Beads orbit the hero, hit on contact | Wisdom Eye | **108 Beads** / 百八念珠: two rings, opposite directions |
| Alms bowl | Alms Bowl / 钵盂 | Thrown, returns, drags small mobs along | Karma | **Bottomless Bowl** / 无底钵: swallows small mobs, drops their XP at once |

Unlock order: ball (start), staff (ch1), wooden fish (ch2), beads (ch3), bowl (ch4), so the
first clear already changes how the game plays.

## Spells (8) and evolutions

Five spells are in the pool from the start; three are unlocked by sutras (achievements).
The engine already has four of these shapes (`nova`, `meteor`, `field`, `chain`).

| Spell | en / zh-CN | Shape | Pairs with | Evolution |
|---|---|---|---|---|
| Buddha Palm | Buddha Palm / 如来掌 | Giant palm slams the densest group (`meteor`) | Wisdom Eye | **Mountain Palm** / 五指山: the palm stays and pins mobs for 2 s |
| Vajra Bolt | Vajra Bolt / 金刚雷 | Lightning chains through 5 mobs (`chain`) | Wrath | **Endless Chain** / 雷音: the chain does not weaken and forks |
| Incense Ring | Incense Ring / 香火阵 | Burning zone at the hero's feet (`field`) | Alms Rice | **Healing Incense** / 万家香火: standing in it heals |
| Golden Bell | Golden Bell / 金钟罩 | Blocks one hit every 8 s; breaking it blasts (`nova`) | Iron Head | **Golden Body** / 金身: 2 s of immunity after it breaks, larger blast |
| Flying Cymbals | Flying Cymbals / 飞钹 | Two cymbals fly straight across the screen, pierce | Arhat Legs | **Cymbal Wheel** / 钹轮: cymbals circle the hero permanently |
| Lotus Steps *(sutra)* | Lotus Steps / 莲步 | Walking drops lotus seeds that burst when stepped on | Karma | **Lotus Path** / 步步生莲: every step blooms, and blooms pull XP |
| Halo Beam *(sutra)* | Halo Beam / 佛光 | A beam rotates around the hero | Calm Mind | **Boundless Light** / 普照: three beams |
| Lion's Roar *(sutra)* | Lion's Roar / 狮子吼 | Cone shout in the move direction, pushes back | Focus | **Thunder Roar** / 狮王吼: full circle, shatters bullets |

Lotus Steps rewards moving and Halo Beam rewards standing still, so both fit Stillness.

## Passives (8)

| Passive | en / zh-CN | Per level *(tune)* |
|---|---|---|
| Calm Mind | Calm Mind / 禅心 | Spell cooldown −8 % |
| Iron Head | Iron Head / 铁头功 | Max health +15 % |
| Arhat Legs | Arhat Legs / 罗汉腿 | Move speed +8 % |
| Wisdom Eye | Wisdom Eye / 慧眼 | Area +10 % |
| Alms Rice | Alms Rice / 斋饭 | Regenerate 0.4 % health per second |
| Wrath | Wrath / 怒目 | Crit chance +5 % |
| Focus | Focus / 定力 | Duration +10 %, knockback resist |
| Karma | Karma / 善缘 | XP +8 %, pickup radius +15 % |

Six are in the pool from the start; Focus and Karma come from sutras.

## Shrines (waves 5, 15, 25, 35, 45)

Between waves the horde pauses; three cards, pick one:

| Card | Effect |
|---|---|
| **Heal** | Restore 50 % health |
| **Insight** | A free level-up pick (1 of 3) |
| **Offering** | +30 % copper at the results of this run *(tune)*, paid only if the player reaches the next shrine alive |

The Offering is a bet against your own survival: it fits "copper is scarce" and gives
skilled players a way to farm faster.

## Enemies

**Mechanics first, art second.** Each chapter introduces one new enemy mechanic; later
chapters mix old ones. Mobs are baked frame sequences (`tools/bake_mob.py`), so a recolour
or a new single image is cheap; elites and bosses cost a rig each.

| Mechanic | Behaviour | Engine status |
|---|---|---|
| Chaser | Walks at the hero | Done (horde) |
| Runner | Fast, low health | Speed variant |
| Swarm | Many tiny, die in one hit | Count variant |
| Shooter | Stops at range, fires a 3-bullet fan | Done (threats, test only) |
| Zone caster | Marks a ground circle, blasts after a warning | Done (threats, test only) |
| Charger | Telegraphs a line, then dashes along it | New |
| Emerger | Appears from a ground mark next to the hero | New |
| Splitter | Splits into 2 small ones on death | New |
| Shielder | Blocks the relic from the front, spells still hit | New |

## Chapters (5)

Cold palette everywhere (teal, purple, grey; red eyes); grounds must not swallow the cyan
mobs (lesson from the readability test: grass works best).

| # | Ground | Mobs | Elites | Mid-boss (25) | Boss (50) |
|---|---|---|---|---|---|
| 1 | **Ruined Temple** / 荒寺: grass and broken stones | Jiangshi, the hopping vampire (chaser), fox spirit (runner), ghost wisp (swarm) | Big jiangshi (charger) | Two big jiangshi | **Fallen Abbot** / 堕落方丈 (implemented): slam |
| 2 | **Misty Marsh** / 雾沼: reeds, shallow water | Water ghost (emerger), toad (shooter), wisp | Toad king (shooter + zone) | Fallen Abbot, empowered | **Black Carp King** / 黑鱼精: dives, surfaces with a shockwave |
| 3 | **Snow Pass** / 雪岭: snow, pines | Snow wolf (runner pack), ice wraith (zone), jiangshi recolour | Wolf leader (charger + howl buffs) | Black Carp, empowered | **Bone Witch** / 白骨精: summons skeletons (splitters) |
| 4 | **Ghost Market** / 鬼市: night street, blue lanterns | Paper effigy (splitter), lantern ghost (shooter), long-tongue ghost (emerger) | Door god statue (shielder) | Bone Witch, empowered | **Underworld Judge** / 判官: writes zones in lines, changes them mid-fight |
| 5 | **Demon Peak** / 魔窟: dark rock, purple fire | Fallen monk (shielder), shadow (runner), every earlier type | Two elites at once | Underworld Judge, empowered | **Inner Demon** / 心魔: a cold-coloured copy of the hero, uses the player's own relic |

- The Inner Demon reuses the hero rig with a cold recolour, which saves a full boss rig and
  is the story beat: the last enemy is yourself.
- Elite waves (10/20/30/40) use the chapter's elites; wave 40 adds one from the previous
  chapter.
- Art budget at launch: about 12 new mob images, 5 elites, 4 new boss rigs.

## Story (light)

A cheerful, slightly dim monk kicks a cuju ball through a land where the temple's abbot has
fallen to darkness. One line of text before each boss, one after; no cut-scenes. Tone:
funny outside, serious threat (as agreed for the art).

## International players

Most CrazyGames traffic is outside China, so the theme must read without knowing it.

- **English names say what a thing does** (Mountain Palm, Endless Chain, Bone Witch); the
  Chinese names keep the references (五指山, 雷音, 白骨精). Each language gets its own good
  name rather than a literal translation.
- **Every card shows its effect in one short line with numbers** and an icon; the name is
  flavour. Nothing needs lore to be understood.
- **Teach with pictures, not text:** the tutorial is a joystick hint and visible effects;
  enemy attacks are read from telegraphs (red circles, lines), never from text.
- **Use the theme's widely known pieces:** kung-fu monk, hopping vampire, fox spirit, kicked
  ball, ghost lanterns. Lesser-known figures (judge, bone witch) are shown by their look.
- **Respectful with religion:** the comedy comes from the monk, never from the Buddha or
  sacred practice. No real scripture text, no 卍 symbol anywhere (misread in the West), no
  Buddha figure as an enemy; the villains are fallen people and demons.
- **No Chinese characters that carry meaning in the art** (signs, talismans, banners stay
  blank or use abstract marks), so art needs no localization and nobody is left out.
- **Story in one line per boss**, translated like any other string; humour is visual
  (slapstick, faces), which travels better than wordplay.
