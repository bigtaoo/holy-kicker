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
- **Implemented** (`engine/content.ts`, `engine/systems/build.ts`): the experience curve and
  pick 1 of 3, cuju levels 1–5, the five starting spells and the six starting passives. The
  Golden Bell recharges only after it breaks; Flying Cymbals fly out in an even star, the
  first at the nearest enemy.
- **Evolutions implemented** (`SPELL_EVOLVED`, `RELIC_AWAKENED`, `EVOLVE` in `engine/content.ts`):
  a ready evolution is always dealt first on the next level-up (or Insight) as a gold card; the
  evolved row keeps the level-5 numbers and adds the mechanic. Mountain Palm leaves a print
  that pins mobs for 2 s and burns at 30 %; Endless Chain forks to the nearest other enemy at
  every jump; Healing Incense heals 2.4 % health per second inside; Golden Body guards 2 s
  after it breaks with a bigger blast; Cymbal Wheel keeps 4 cymbals circling at 260 (a target
  is hit again every 0.5 s, mobs pressed against the hero are inside the ring and safe from
  it); Meteor Ball sends 2 one-hit splinters at other targets on every bounce; Bottomless Bowl
  swallows up to 8 mobs a throw for their experience.
- **Codex implemented** (`client/src/meta/codex.ts`, `client/src/ui/codexTab.ts`): the save keeps
  every evolution and awakening done at least once; a run reports what it evolved when it is
  settled (also on giving up), and the results name the new entries. The lobby's Codex tab
  (open after chapter 2) shows all of them (10 with the alms bowl), the found ones by name and the rest as "???";
  tapping one shows what it does and its recipe, which is never hidden.
- **Build strip on the HUD** (`client/src/ui/buildSlots.ts`, `buildBar.ts`): under the
  experience bar, the relic, 4 spell and 4 passive slots (empty ones as dim discs), each with its
  level as 5 pips. Evolved items get a gold rim and gold pips; an item whose evolution comes on the
  next level-up pulses gold; a maxed item still missing its passive shows that passive small on
  its corner. Level-up cards show the item icon, with the passive a spell evolves with (or the
  owned items a passive would evolve) small on the corner, so the recipe is learned without text.

## Relics (5)

Unlocked one per chapter clear (the cuju ball is the starter).

| Relic | en / zh-CN | Attack | Awakens with | Awakened |
|---|---|---|---|---|
| Cuju ball | Cuju Ball / 蹴鞠 | Kicked, bounces between 3 targets (implemented) | Arhat Legs | **Meteor Ball** / 流星鞠: splits into 3 on every bounce |
| Staff | Staff / 禅杖 | Close 180° sweep with knockback (implemented) | Iron Head | **Ruyi Staff** / 如意禅杖: sweep grows to a full circle and longer reach (implemented) |
| Wooden fish | Wooden Fish / 木鱼 | Each tap sends a sound ring around the hero (implemented) | Calm Mind | **Stunning Bell** / 晨钟: every 4th ring stuns for 1 s (implemented) |
| Prayer beads | Prayer Beads / 念珠 | Beads orbit the hero, hit on contact (implemented) | Wisdom Eye | **108 Beads** / 百八念珠: two rings, opposite directions (implemented) |
| Alms bowl | Alms Bowl / 钵盂 | Thrown, returns, drags small mobs along (implemented) | Karma | **Bottomless Bowl** / 无底钵: swallows small mobs, drops their XP at once (implemented) |

Unlock order: ball (start), staff (ch1), wooden fish (ch2), beads (ch3), bowl (ch4), so the
first clear already changes how the game plays.

- **Staff implemented** (`STAFF_LEVELS`, `STAFF_AWAKENED` in `engine/content.ts`,
  `engine/systems/staff.ts`): the swing starts when a target is within 115 % of the reach and
  lands at the kick's strike time over the half circle toward it, hitting everything inside the
  reach (270 → 340, awakened 440) at 220 → 400 % and knocking the horde back 90 → 150; the elite
  and the boss are not knocked back, so the staff keeps hitting them. The relic is chosen in the
  lobby under the chapter card (`save.relic`, one more unlocked per chapter cleared, announced on
  the results); `RunConfig.relic` sets it for the run, `?relic=staff` forces it in dev.
- Balance (`npm run balance -- 10 skilled casual staff`): the staff only works when the player
  goes to the big ones, so the bots chase the elite and the boss with it (and still run from a
  slam). Then a chapter takes about as long as with the ball (790 s against 800–830 s), elites
  and bosses fall a little faster, and the hero takes about a third less damage (the knockback).
- **Wooden fish implemented** (`FISH_LEVELS`, `FISH_AWAKENED`, `FISH` in `engine/content.ts`,
  `engine/systems/fish.ts`): the hero taps when a target is within 90 % of the reach; a ring
  grows from where he stood at 1500 units/s to its reach (360 → 460, awakened 520) and hits each
  enemy it passes once at 150 → 280 %, the elite and the boss at full relic damage, with no
  knockback. The Stunning Bell (with Calm Mind) makes every 4th ring stun the mobs and the elite
  it passes for 1 s (they stand frozen; the boss is not stunned). A mob it kills respawns
  unstunned, so the stun matters on the tougher late waves and the elite.
- Balance (`npm run balance -- 10 skilled casual fish`): like the staff, the fish only reaches the
  big ones if the bots close in (to 220–330, inside the reach); then a chapter takes 805 s,
  level with the ball, and the hero takes less damage than with it. Kept away (the ball's
  distance) the rings never reach the boss and a chapter took 960–1020 s.
  Without the chase the boss took 3–10 times as long.
- **Prayer beads implemented** (`BEADS_LEVELS`, `BEADS_AWAKENED`, `BEADS` in `engine/content.ts`,
  `engine/systems/beads.ts`): 3 → 6 beads circle the hero at 150 (one turn every 1.6 → 1.2 s)
  and hit each enemy a bead touches (within 85 of it) once per pass, at 70 → 120 %, the elite and
  the boss at full relic damage, with no knockback. The ring covers 65–235 from the hero, where
  the horde (70), the boss (150) and the elite (220) stop, so the hero never swings: he only has
  to stand close. 108 Beads (with Wisdom Eye) adds a second ring of 6: the inner one at 115, the
  outer at 250 turning the other way (gold beads), reaching 335.
- Balance (`npm run balance -- 10 skilled casual beads`): with the bots closing in like for the
  staff, a chapter takes 804–808 s (ball 803–829, fish 803–805); bosses fall in 25–60 s.
- **Alms bowl implemented** (`BOWL_LEVELS`, `BOWL_AWAKENED`, `BOWL` in `engine/content.ts`,
  `engine/systems/bowl.ts`): thrown at a target within its reach (the boss and the elite first),
  the bowl flies the reach (480 → 600, awakened 640) at 1400 units/s and comes back to the hero,
  hitting each enemy within 80 of it once each way at 150 → 280 %, the elite and the boss at full
  relic damage, with no knockback. On the way out it drags up to 3 → 6 mobs it hit and leaves
  them at the far end, clearing room. One bowl is in the air at a time: the next throw waits for
  the catch and the cooldown (1 → 0.85 s). The Bottomless Bowl (with Karma) swallows up to 8 mobs
  a throw instead: they go down without a gem and their experience goes straight to the hero.
- Balance (`npm run balance -- 10 skilled casual bowl`): kept at the ball's distance (no chase), a
  chapter takes 807 s skilled and 830 s casual (ball 814 / 823), every skilled run won; one casual
  run without the Golden Bell fell at the last boss.

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
| Lion's Roar *(sutra)* | Lion's Roar / 狮子吼 | Cone shout at the nearest enemy, pushes back | Focus | **Thunder Roar** / 狮王吼: full circle, shatters bullets |

Lotus Steps rewards moving and Halo Beam rewards standing still, so both fit Stillness.

- **Sutras implemented** (`engine/systems/sutras.ts`, ENGINE_VERSION 13). A sutra is earned by an
  achievement read from the save (`client/src/meta/progress.ts` `earnedSutras`, goals in
  `balance.json` `sutras`): Lotus Steps for reaching wave 25, Halo Beam for one Codex entry,
  Lion's Roar for clearing chapter 2, Focus for 10 finished runs. A run's `RunConfig.sutras`
  adds their cards to the pool; a locked sutra spell shows its goal in the Codex.
- **Lotus Steps**: every cooldown while the hero walks he drops a seed (life 2.5–3 s). It arms
  after 0.4 s and blooms when an enemy comes within 130 of it; at the end of its life it
  blooms anyway if an enemy is inside its bloom radius, else it withers. Seeds that bloomed only
  when stepped on were too rare (the horde follows, it rarely walks over a seed). Lotus Path
  drops one every 0.2 s and each bloom sends the gems within 450 to the hero.
- **Halo Beam**: always turning (one turn per 1.6 s down to 1.1 s, faster with Calm Mind), hits
  each target once per sweep; on the move the beam is 70 % as long, so it rewards standing.
- **Lion's Roar** aims at the nearest enemy rather than the move direction: the player mostly
  walks away from the horde, so a roar ahead hit nothing. The 120° cone pushes the mobs it does
  not fell back by 220.
- **Focus**: there is no knockback on the hero, so its second half is guard: the untouchable
  time after a hit +20 % per level, next to spell duration +10 % (prints, cymbal flights,
  incense rings, lotus seeds).
- Balance (40 casual runs per row): 37/40 won without sutras, 37 with only Lion's Roar, 35 with
  Halo Beam, 30-31 with Lotus Steps or Focus alone (Focus alone shows that most of that is a
  thinner pool for the bot, not a weak spell), 34 with all four; skilled 20/20 with all four.

## Passives (8)

| Passive | en / zh-CN | Per level *(tune)* |
|---|---|---|
| Calm Mind | Calm Mind / 禅心 | Spell cooldown −8 % |
| Iron Head | Iron Head / 铁头功 | Max health +15 % |
| Arhat Legs | Arhat Legs / 罗汉腿 | Move speed +8 % |
| Wisdom Eye | Wisdom Eye / 慧眼 | Area +10 % |
| Alms Rice | Alms Rice / 斋饭 | Regenerate 0.4 % health per second |
| Wrath | Wrath / 怒目 | Crit chance +5 % |
| Focus | Focus / 定力 | Duration +10 %, guard after a hit +20 % (implemented) |
| Karma | Karma / 善缘 | XP +8 %, pickup radius +15 % (implemented) |

Seven are in the pool from the start; Focus comes from a sutra. Karma was planned as a sutra
unlock but is in the pool from the start, since the alms bowl awakens with it (2026-10-03).
Experience gains keep their fraction (`Player.xpPart`), so +8 % counts on 1-point gems.

## Shrines (waves 5, 15, 25, 35, 45)

Between waves the horde pauses; three cards, pick one:

| Card | Effect |
|---|---|
| **Heal** | Restore 50 % health |
| **Insight** | A free level-up pick (1 of 3) |
| **Offering** | +30 % copper at the results of this run *(tune)*, paid only if the player reaches the next shrine alive |

- **Implemented** (`engine/systems/build.ts` `openShrine`, `SHRINE` in `engine/config.ts`):
  the run stands still on the three cards like a level-up; Insight deals a level-up offer
  without a level; an Offering taken on wave 45 is won by clearing the chapter. The won
  offerings are paid in `settleRun` (`offeringPercent` in balance.json).

The Offering is a bet against your own survival: it fits "copper is scarce" and gives
skilled players a way to farm faster.

## Enemies

**Mechanics first, art second.** Each chapter introduces one new enemy mechanic; later
chapters mix old ones. Mobs are baked frame sequences (`tools/bake_mob.py`), so a recolour
or a new single image is cheap; elites and bosses cost a rig each.

| Mechanic | Behaviour | Engine status |
|---|---|---|
| Chaser | Walks at the hero | Done (horde; the jiangshi) |
| Runner | Fast, low health | Done (the fox: 185/s, 60 % health) |
| Swarm | Many tiny, die in one hit | Done (the ghost wisp: packs of 10) |
| Shooter | Stops at range, fires a 3-bullet fan | Done (the toad, chapter 2) |
| Zone caster | Marks a ground circle, blasts after a warning | Done (the toad king's pools; threats test) |
| Charger | Telegraphs a line, then dashes along it | Done (the big jiangshi elite) |
| Emerger | Appears from a ground mark next to the hero | Done (the water ghost, chapter 2) |
| Splitter | Splits into 2 small ones on death | New |
| Shielder | Blocks the relic from the front, spells still hit | New |

- **Chapter 1's kinds implemented** (`MOB_KINDS`, `MIX`, `ELITE` in `engine/config.ts`,
  `engine/systems/elite.ts`, ENGINE_VERSION 14). Every mob has a kind it keeps for the run
  (respawns included). From wave 3 every 4th newcomer is a fox runner; from wave 6, every 4th
  wave (not a boss wave) brings a bunched pack of 10 ghost wisps on top of the horde, up to 40.
  Wisps have 1 health, hurt for 3 and only a quarter of them leave a gem: without that cut the
  packs lifted the casual bot from level 30 to 38 at the end. The elite is now the big
  jiangshi charger: within 750 of the hero it stops and marks a lane at him (violet, 0.8 s),
  dashes 1050 along it hurting for 22, rests 0.7 s and charges again after 2.5 s; the lane is
  fixed when it aims, so a step aside dodges it. The fox is no longer the elite. The wisp is
  drawn in code (`client/src/game/wispSheet.ts`), the big jiangshi is the jiangshi sheet
  scaled and tinted steel blue. Balance (40 runs, casual): 36/40 won at level 33, against
  37/40 at level 30 before; skilled 39/40; every relic 17–20/20 out of 20.
- **The mid-boss twins** (`WAVES.twinHp`, `WAVES.twinDelay`, ENGINE_VERSION 15). The state
  holds a list of elites (targets number mobs, then the elites, then the boss). Wave 25
  brings two big jiangshi from opposite sides of the hero, 650 health each (the stand-in
  abbot had 1200), the second's first charge 1.5 s later; they take turns, one aims only
  while the other is not charging, so two lanes never cross the hero at once. The wave
  lasts until both fall; they share a health bar ("Twin Jiangshi" / 双煞僵尸) and the
  second is tinted slate violet. Balance (40 runs, casual): 35/40 won, level 34; the twins
  fall in 27–118 s, median about 50 s; skilled 39/40.
- **Chapter 2's kinds implemented** (`RunConfig.chapter`, `CHAPTER_MOBS`, `EMERGE`, `SHOOTER`
  in `engine/config.ts`, `engine/systems/marsh.ts`, ENGINE_VERSION 16). Each chapter has its
  own newcomer rules; chapter 2 drops the fox for the water ghost (emerger: every 5th
  newcomer from wave 2) and the toad (shooter: every 8th from wave 3), and its plain walkers
  are drawn as water ghosts too. A water ghost waits under the ground (2–5 s after it falls
  or joins, untouchable), then marks a spot 180–340 from the hero for 1 s (violet ripples)
  and rises there with a splash, hurting a hero within 80 for 6. The toad walks slower
  (95/s, 80 % health), stops 460 from the hero and every 5–7 s swells for 0.5 s and spits a
  3-bullet fan (6 per hit); it only starts to swell with the hero within 720. The bot now
  reads a bullet's path a second ahead and keeps clear of marks. Both are drawn in code
  (`client/src/game/marshSheets.ts`) until their art is baked. Balance (40 runs): chapter 2
  casual 21/40 won (level 31), skilled 24/40; staff 13, beads 12, fish 10, bowl 8 out of 20;
  chapter 1 is unchanged (casual 35/40). The
  first tuning (toads every 6th firing every 3 s, ghosts every 4th rising 140–320 away,
  bullets and rising 8–10) had the casual bot win 7/40 and die around wave 21.
- **The toad king** (`CHAPTER_ELITES`, `TOAD_KING` in `engine/config.ts`, `stepToadKing` in
  `engine/systems/marsh.ts`, ENGINE_VERSION 17). Elites have a kind; each chapter has its
  own, and the last elite wave (40) brings the previous chapter's along (the big jiangshi on
  the marsh). The toad king (400 health) walks at 120/s to 380 from the hero and, with him
  within 800 and its 2 s cooldown done, swells for 0.8 s, then in turn spits a 5-bullet fan
  at him or marks 3 poison pools (radius 140: one on him, two within 140–300 of him) that go
  off after the usual 1.2 s warning for 12, and sits 0.6 s. Zones now carry their own
  damage and age in every run, not only the threats test. Hits push it only 30 (the big
  jiangshi 160): with the full push it was knocked out of the ball's kick range and lived
  60–500 s (the big jiangshi on the marsh: 10–170 s, median about 35 s); now 3–270 s, median
  about 45 s. The bot keeps 90 clear of a marked zone. It is the toad drawn bigger in
  slate teal with a jade crown (`toadKingSheet`). Balance (40 runs): chapter 2 casual 22/40
  (level 31), skilled 26/40; staff 13, fish 13, beads 12, bowl 8 out of 20; chapter 1
  unchanged (35/40).
- **The empowered abbot** (`EMPOWERED` in `engine/config.ts`, ENGINE_VERSION 18). From
  chapter 2 on, wave 25 brings the Fallen Abbot instead of the twins, and the wave lasts
  until it falls: 1500 health (the chapter boss 3000), 1.8 s between slams (2.5 s), and every
  slam also sends a ring of 10 bullets out from the rim of its circle (turned by the tick,
  so rings differ), to slip through between them. On screen it is tinted dusky violet and
  its bar reads "Fallen Abbot, Empowered" / 狂化方丈. Balance (40 runs, chapter 2 casual):
  21/40 (22 before), skilled 25/40 (26); it falls in a median 76 s (the twins 72 s), and
  4 runs end on waves 25–29 against 7 with the twins.
- **The Black Carp King** (`CARP`, `CHAPTER_BOSSES` in `engine/config.ts`, `stepCarp` in
  `engine/systems/carp.ts`, ENGINE_VERSION 19). Bosses have a kind; chapter 2's last wave
  brings the carp. It swims after the hero at 110/s to 160 from him and every 3 s dives: for
  1.2 s it is out of reach (no kicks, no contact) and swims under him at 520/s, then locks a
  circle of radius 240 where he stands and rises under it for 1 s. Surfacing hurts him inside
  for 25 and sends a ring of 12 bullets out from the rim; it then lies winded for 1.2 s, the
  time to kick it. It comes to the hero, so it is kicked far more than the abbot the bot keeps
  away from (the abbot on wave 50 lived a median 181 s; the carp with 2400 health 52 s, less
  than the mid-boss), so it has 4000: a median 88 s casual, 78 s skilled. On screen it is drawn
  in code (`carpSheet`) until it gets a rig: an ink-slate carp standing out of the shallows,
  purple fins, barbels, red eyes and a jade crown; under water a dark shape with ripples and a
  fin, its circle in the attack violet, a splash when it dives and surfaces; the bar reads
  "Black Carp King" / 黑鱼精. `BossStage` (client) sends the boss events to the abbot's or the
  carp's view by kind. Balance (40 runs, chapter 2): casual 17/40 (21 with the abbot), 5 runs
  lost on wave 50 (1); skilled 24/40 (25), 3 lost on wave 50.

## Chapters (5)

Cold palette everywhere (teal, purple, grey; red eyes); grounds must not swallow the cyan
mobs (lesson from the readability test: grass works best).

| # | Ground | Mobs | Elites | Mid-boss (25) | Boss (50) |
|---|---|---|---|---|---|
| 1 | **Ruined Temple** / 荒寺: grass and broken stones | Jiangshi, the hopping vampire (chaser), fox spirit (runner), ghost wisp (swarm) | Big jiangshi (charger, implemented) | Two big jiangshi (implemented) | **Fallen Abbot** / 堕落方丈 (implemented): slam |
| 2 | **Misty Marsh** / 雾沼: reeds, shallow water | Water ghost (emerger), toad (shooter), wisp | Toad king (shooter + zone, implemented) | Fallen Abbot, empowered (implemented) | **Black Carp King** / 黑鱼精 (implemented): dives, surfaces with a shockwave |
| 3 | **Snow Pass** / 雪岭: snow, pines | Snow wolf (runner pack), ice wraith (zone), jiangshi recolour | Wolf leader (charger + howl buffs) | Black Carp, empowered | **Bone Witch** / 白骨精: summons skeletons (splitters) |
| 4 | **Ghost Market** / 鬼市: night street, blue lanterns | Paper effigy (splitter), lantern ghost (shooter), long-tongue ghost (emerger) | Door god statue (shielder) | Bone Witch, empowered | **Underworld Judge** / 判官: writes zones in lines, changes them mid-fight |
| 5 | **Demon Peak** / 魔窟: dark rock, purple fire | Fallen monk (shielder), shadow (runner), every earlier type | Two elites at once | Underworld Judge, empowered | **Inner Demon** / 心魔: a cold-coloured copy of the hero, uses the player's own relic |

- The Inner Demon reuses the hero rig with a cold recolour, which saves a full boss rig and
  is the story beat: the last enemy is yourself.
- Elite waves (10/20/30/40) use the chapter's elites; wave 40 adds one from the previous
  chapter (implemented).
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
