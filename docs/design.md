# Holy Kicker — game design

Status: agreed outline (2026-10-01). Numbers marked *(tune)* are starting values for balancing,
not commitments.

## Pillars

- **Every session pays, however short.** A 3-minute death still yields copper and a chance at
  gear; a long session yields visibly more. Merge costs stay as below until feedback says
  progress feels too slow, then they come down.
- One run is one chapter: 50 waves, about 12–13 minutes, portrait, one thumb.
- Meta progression is a **mix**: a shallow stat line decides *how far* you get, a content line
  decides *how you play*. A skilled player can beat a chapter or two above their gear.
- **CrazyGames first**, then WeChat. Poki is exclusive, so it is the fallback only if
  CrazyGames does not work out. Ads only on the web and WeChat: **no IAP** there. iOS adds
  one purchase, the ad-free card (`docs/ios.md`). **No stamina** anywhere. No gacha.
- **Localized from day one** (see Localization).
- First version is single-player only.

## Flow

```
launch → load → silent sign-in → [first launch] straight into chapter 1 → results → lobby
                                  [afterwards]  lobby → play → run → results → lobby
```

- **Sign-in has no screen.** CrazyGames: SDK account and data module (guests save locally and
  carry over on sign-in). WeChat: `wx.login` openid, cloud save.
- **First launch skips the lobby.** The tutorial lives in chapter 1's first waves (only the
  move joystick is prompted; everything else is automatic). The lobby appears after the first
  run ends.
- **Lobby features unlock gradually:**

| Unlocks at | Feature |
|---|---|
| End of first run | Play, Gear (first run always drops one item), Shop |
| Player level 2 | Training (talents), daily challenge *(planned)* |
| Chapter 1 cleared | Patrol (idle income), second relic, weekly challenge *(planned)* |
| Chapter 2 cleared | Codex |

## Chapters (the run)

A chapter is one map with 50 waves of about 15 s each (from chapter 3 a normal-mode wave also
waits for kills, "Pace from chapter 3" below). Dying restarts the chapter; the best wave reached
is recorded.

| Wave | Content |
|---|---|
| 1–9 | Regular hordes, ramping up |
| Every 5th (5, 15, 25, …) | **Shrine**: pick one — heal, or an extra skill |
| 10 / 20 / 30 / 40 | **Elite wave**: 1–3 elites that force movement |
| 25 | Mid-boss (may reuse the previous chapter's boss, empowered) |
| 50 | **Chapter boss** (chapter 1: the fallen abbot) |

- In-run levelling: XP orbs, pick 1 of 3 on level-up (relic upgrade / spell / passive).
  Specific spell + passive pairs **evolve**.
- Winning: the sim stops on the tick the chapter boss goes down, but the view keeps its clock
  for the monk's closing line before the results. The boss shudders, sinks and fades
  (`game/bossFall.ts`, 1.3 s, on the view clock; mid-bosses fall the same way), and whatever
  is still standing drops as corpses with it, so the win never looks like a frozen screen.
- Death: one rewarded-ad revive per run; otherwise results are paid by the wave reached.
- **Progress chests** at waves 10/20/30/40/50 of each chapter, claimable once each, so a
  failed push still pays. A run only unlocks them; the player opens them on the lobby's chapter
  card (a lit chest with a dot), which keeps the results short and gives the lobby a first tap.
- Clearing a chapter unlocks the next. Three stars on a chapter open its hard mode ("Stars").
- **Twenty chapters over the five maps** (engine `chapters.ts`): chapter c plays map
  ((c−1) % 5) + 1, five chapters to an act, so a new act costs no new art. The climb from one
  chapter to the next is flatter than the old five-chapter one (`twenty-chapters` experiment,
  2026-10-21: a casual player clears chapter 20 around day 40, 2–16 tries a chapter).

### Acts

Every round of the five maps is an act (engine `acts.ts`, `ACTS`); each act from the second
keeps the earlier acts' rules and adds one, so the same art plays differently. Hard mode plays
the same rules.

- **Act 2 (chapters 6–10), night**: the view darkens and cools the ground (client only); the
  next map's newcomers join the horde `ACTS.mixDelay` waves after their own start, and the
  map's elite comes as a pair, each at full health (the ladder carries the cost).
- **Act 3 (11–15), affixes** (`AFFIX`, `systems/affixes.ts`): elites carry one, bosses and
  mid-bosses two, drawn as they arrive: **shield** (blocks whole hits, 3, one back every 2 s),
  **haste** (cooldowns 1.5× and a wolf-leader howl every 5 s), **split** (bone crawlers at every
  quarter of health lost) and **explode** (a bullet ring and a marked circle at every quarter).
  Each shows a code-drawn sticker badge: over an elite's head, beside the boss bar for a boss.
- **Act 4 (16–20), boss rush**: the last wave brings the next map's boss at half health (the
  abbot instead of the Inner Demon), then the map's own, each 1.5 s after the one before falls;
  chapter 20 brings all five, the Inner Demon last.
- **The story moves with them**: an opening line per act and the act's own mid-boss and boss
  lines (`story.a{act}.*`, docs/content.md "Story").

### Stars

A cleared chapter shows up to three stars on the lobby's card (the best run's), the results
show the run's own and what the next one asks:

| Stars | The run |
|---|---|
| 1 | cleared the chapter |
| 2 | cleared it without a revive |
| 3 | and the hero's health never under `BALANCE.stars.lowest` (50%) of the maximum |

The engine keeps the lowest health (`Player.lowest`, percent); the client counts the stars
(progress.ts `runStars`) and keeps the best per chapter and mode (`stars`, `hardStars`).
Three stars on normal chapter n open hard chapter n. On a normal chapter run a thin gold rim
frames the hero's health bar while the third star is still in reach; it fades out once the lowest
health went under the threshold and stays gone for the run, even when he heals back
(game/starMark.ts; hard mode and challenges have none). The bar itself has no marks: its fill
steps through four colour bands by share of the max health, green from 75 %, yellow-green from
50 %, amber from 25 % and a gently pulsing red below (game/healthBand.ts).

### Difficulty

Measured with the balance bots (`npm run balance`, engine/README.md), without revives and
without meta upgrades. Chapter 1 targets and the result of the first tuning pass (20 seeds,
2026-10-01; "with shrines" is after the shrines came in, the bot healing below 60 % health and
otherwise taking Insight):

| Player | Target | Measured | With shrines |
|---|---|---|---|
| Skilled (dodges at once) | wins almost always, real danger only at the boss | 18/20 won | 19/20 |
| Casual (reacts in 0.4 s) | about half win; deaths spread over waves 25–50 | 10/20 won, deaths at 25–50 | 14/20; deaths at 25, 28, 38, 50 ×3 |
| Standing still | falls at the mid-boss | median wave 25, never wins | the same |
| Elites / mid-boss / boss | 15–40 s / 30–60 s / 40–80 s | about the same | the same |
| Level at the end | about 30 | 30 | 30 |

- **With evolutions** (2026-10-02, same 20 seeds): skilled 20/20, casual 18/20 (deaths at 29
  and 43), about two evolutions per run. No single evolution carries it (turning any one off
  moves at most one win), and keeping the evolved damage at the level-5 numbers did not
  change the result. Left as it is for now, like the shrines; if it stays too easy once real
  players have tried it, raise the late mob health or contact damage rather than weaken the
  evolutions, which are the run's power spike.
- Mob health grows with the wave, faster late (10 on wave 1, 34 on wave 25, 96 on wave 50), so a
  finished build still meets a threat; contact damage grows 1 per 10 waves.
- Shrines lift casual players over the target; left as it is until real players have tried
  it, since meta upgrades will make it easier still. Mob health (`HORDE.hpSquare`) barely
  moves the result; the Insight picks are what help.
- The relic aims at the boss, then the elite, before any mob: the elite is the relic's job.
- The first ~10 waves rarely hurt: they are the tutorial. Later chapters scale from here, and
  meta upgrades and revives make the target easier, so a first clear of chapter 1 is a few
  tries for a new player.
- Relics, spells, passives, shrines, enemies and chapter themes: see [content.md](content.md).

### Pace from chapter 3

A recorded chapter 5 run (2026-10-20) showed the late chapters going flat: the hero circled the
horde, the pile followed about 750 behind with nothing ahead of him, and as mob health outgrew
his damage his kills fell to single digits a wave, so his levels and spells stopped while the
waves ran on by the clock. Two rules, from chapter 3 on only (chapters 1 and 2 are the
tutorial and keep the plain clock):

- **Kill-gated waves** (normal mode only; hard mode keeps the fixed 15 s): a wave lasts until
  half its horde has been felled (`PACE.gatePercent`; the swarm kinds and the summoned do not
  count), at least 15 s and at most 22.5 s (`gateTicks`). A strong build sees no change; one
  that falls behind gets up to half a wave more of the same mobs, so its XP catches up.
- **Outrun mobs come back ahead** (`PACE.lag*`, also in hard mode): a mob kept off every
  hero's screen for 3 s that got no nearer in that time comes back on the ring ahead of the
  hero, like one left too far behind, at most one a second. Circling the pile no longer keeps
  the path clear. Moving them all at once walled every play style in: the casual bot died
  around wave 30 in chapters 3–5, whatever the mob health or contact damage.
- **Hurt by chapter** went from 125/180/180 % to 115/150/150 % for chapters 3–5, so the
  mobs coming back ahead do not make the chapters harder for a player who fights.

Balance bots (24 seeds each, no revives, journey bonuses for each chapter, `circle` kites the
whole horde round one loop; won and median wave, before → after):

| Chapter | Casual | Skilled | Circle |
|---|---|---|---|
| 3 | 4/24, 40 → 4/24, 40 | 9/24, 47 → 11/24, 50 | 0/24, 18 → 0/24, 19 |
| 4 | 4/24, 43 → 5/24, 41 | 6/24, 50 → 14/24, 50 | 0/24, 18 → 0/24, 22 |
| 5 | 1/24, 34 → 3/24, 37 | 11/24, 50 → 9/24, 50 | 4/24, 50 → 1/24, 33 |

Before, circling was the best way through chapter 5 (more wins than the casual bot, its median
run reached the boss); now it is the worst. The price is time: waves in chapters 4–5 mostly run
to the 22.5 s cap, so a skilled chapter 5 run takes about 26 minutes instead of 20 and gains
about one level. Chapter 4 hurt was first 160 %: the casual bot with the weaker bonuses of its
first days there fell from median wave 37 to 33 and the journey took three days longer; at 150
% it wins as often as before or more (first days 2/24 → 4/24, median wave 37 → 35; clearing
bonuses 4/24 → 5/24), the skilled bot clearly more. Hard mode (fixed waves, its own hurt) with
the chapter 5 bonuses: chapter 3 casual stays at median wave 29, circle falls from 35 to 20;
chapter 1 is unchanged.

### Hard mode

Advanced play beside the climb: each chapter has a hard mode of its own, open once the normal
chapter is cleared with three stars.

- **Opens per chapter**: the results of the three-star run say so. From the first clear a
  Normal / Hard switch sits above the chapter card; it follows the chapter the card shows, and
  a hard mode still locked shows a lock and says how to open it.
- **The same chapters, tougher** (engine `HARD`, `RunConfig.hard`): mob health and every
  hurt take hard mode's own percents by chapter (ramped in over the run like the normal ones),
  elites and bosses have 3.5–4.5× their health, and every elite wave brings one elite more.
- **Its own progress**: best waves, stars and progress chests are kept apart from the normal
  chapters (`hardBest`, `hardStars`, `hardChests` in the save; a best of 50 waves is a clear).
- **Better pay**: hard chapter n counts as stage n + `BALANCE.hardStage` (6, progress.ts
  `stage`), so its copper, chests and gear drops are those of the normal chapter six on (the
  `dropTiers` rows stop at 20), and so do patrol and the shop once a hard chapter is cleared.
- **Grit** gathers on the first uncleared normal chapter only; hard mode is never the frontier.
- Relics and sutras come from the normal chapters only.

### Combat feedback (view only)

The opening should feel lively and every blow should read; the late game, with hundreds of
mobs, must stay clear. So the screen's total effect noise is held roughly level: the fewer
blows land, the bigger each one is drawn. None of this touches the engine.

- **Heat** (`client/src/game/fxHeat.ts`): 0 in a quiet opening, 1 in a crowded late chapter,
  measured from hits per second (8 → 60) and mobs on screen (50 → 110); it rises in about a
  second and cools over about four. `hitFeedback.ts` measures it and hands it to every effect.
- **Cold**: big hit sparks sprayed along the blow, a short hit-stop on the struck mob, a small
  camera punch, the ball's gold trail and kick crescent, wider staff and fish swings, bead and
  bowl streaks, dust at the hero's feet, damage numbers 1.15× their size.
- **Hot**: all of that shrinks or goes. Plain damage numbers fade out from heat 0.3 and are not
  shown at all from 0.6; **crits and elite and boss numbers always show in full.** Kills close
  together in place and time share one pop, and kills far from the hero pop smaller.
- **Tiers** (`fx.ts` `FX_TIER`): must (hurt, elite, boss, warnings) ignores the fill budget;
  the hero's own blow may use all of it, hit and kill garnish 75 %, ambient dust 35 %, so on a
  full screen the dust goes first and the hero's blow last.
- Colours keep the art rule: hero effects warm (gold, saffron), enemy effects cold (teal, grey).
  Every new colour has a corgi variant (`CORGI_FX`).

## Meta progression

### A. Stat line (kept shallow)

**Gear — 6 slots:**

| Slot | Role |
|---|---|
| **Relic** (main hand) | Decides the starting weapon and its evolution path — the key slot |
| Jade Pendant / 玉佩 | Attack |
| Bracers | Attack / crit |
| Robe | Health |
| Sash | Health / regen |
| Sandals | Move speed / pickup radius |

**Tiers:** Common, Fine, Refined, Treasured, Sacred. Each tier raises the item's stats and
adds a passive affix. Gear has no levels.

**As built** (`client/src/meta/gear.ts`, numbers in `balance.json` "gear"): one item per slot,
and every relic is an item of the relic slot. The relic chosen in the lobby is the one worn; a
relic unlocked by a chapter clear comes as one Common copy, and relic copies drop like any other
item, so a main relic can be merged up. Items stack as counts per tier and the best tier owned is
worn: there is nothing to equip by hand. Affixes are fixed per slot and tier (no random rolls).
A run drops one item per 10 waves cleared and a chance at one for the rest (the first run always
one); the slot is even, the tier comes from the chapter's weights (chapter 1 all Common, chapter
5 mostly Refined, 2 % Sacred). Gear and training reach the engine only as `RunConfig.bonus`
(engine stats, including the gear-only `attack`) summed in `meta/loadout.ts`.

**One upgrade operation — gear and copper only, no other materials:**

**Merge:** 5 items of the same name and tier + copper → 1 item of the next tier.

| Merge | Copper *(tune)* | Commons per item |
|---|---|---|
| Common → Fine | 200 | 5 |
| Fine → Refined | 1 000 | 25 |
| Refined → Treasured | 4 000 | 125 |
| Treasured → Sacred | 15 000 | 625 |

Drops are the supply, copper is the brake. Higher chapters drop higher tiers directly, so
nobody actually merges 625 commons; the column only shows how steep the curve is.

*Risk:* with only 4 steps per slot, each step is a big jump and the gaps between them are long.
If playtests feel flat, add star sub-steps inside a tier rather than going back to levels.

**Merge screen and effect:**

1. The merge panel shows 5 sockets around a centre; "Auto fill" picks matching items, players
   can also tap them in. The merge button shows the copper cost and greys out when short.
2. On merge the 5 items fly into the centre in turn, each landing with a small pop and a short
   camera shake.
3. The centre charges: a glow ring in the **target tier's colour** spins up, then a white flash.
4. Burst of tier-coloured sparks and rays; the new item drops in with a squash-and-stretch
   bounce inside a new tier frame.
5. A stat card slides up with old → new values counting up, and the new affix shown.
6. Tap skips to the result. "Merge all" runs every possible merge with a short version of the
   effect (steps 2–3 sped up), then shows one summary card.

Tier colours (UI only): Common grey, Fine green, Refined blue, Treasured purple, Sacred gold.
Sacred gets an extra lingering shine on its icon everywhere in the UI. The effect reuses the
in-game particle pool (`fx.ts`) and shares no drawing with the world.

**Training (talents):** each player level unlocks one node on a single fixed line, bought with
copper. Plain stats only: health, attack, XP gain, copper gain, pickup radius, extra revive.
No random rolls.

**As built** (`client/src/meta/training.ts`, `balance.json` "training"): 100 nodes (from node 51,
`valueStep`, every node gives twice as much); node n opens at
player level n + 1 and costs 100 + 40 (n − 1) copper. The line repeats attack +2 %, health +3 %,
XP +2 %, copper +3 %, pickup range +5 %; nodes 12 and 30 give a free revive instead, offered on
the death panel before the rewarded-ad one.

**Balance check** (balance bots, 40 runs, chapter 2 casual, no revives): 24/40 bare; 36/40 with
every slot Common and 10 training nodes; 40/40 with about all-Fine gear and 25 nodes. Farming a
chapter is meant to carry the next one; chapters 3–5 are to be tuned against that gear.

### B. Content line (the replay motivation)

- **Relics**, each a different way to play, unlocked by clearing chapters:

| Relic | Play style |
|---|---|
| Cuju ball | Bounces between enemies (implemented) |
| Staff | Close sweep with knockback |
| Wooden fish | Sound pulse around the hero |
| Prayer beads | Beads orbiting the hero |
| Alms bowl | Thrown, returns, drags small mobs along |

- **Sutras:** achievements grant sutras; each adds a spell or passive to the in-run pick pool.
  New players see a small, readable pool; veterans get more combinations.
- **Codex** records discovered evolutions.
- **Monks (characters)**: the kicker, the fat monk (tanky, slow, bounces the crowd off when hit)
  and the novice (fast, fragile, dodges on the run), the last two bought with jade
  (docs/content.md "Monks").

### Engine boundary

All meta effects are packed once at run start into the engine's initial state:
`{ stats, startingRelic, skillPool, seed }`. The run never reads meta data, so determinism is
untouched.

## Economy

Two currencies only:

| Currency | Sources | Sinks |
|---|---|---|
| **Copper** | Run results (main), progress chests, daily tasks, patrol (small) | Gear merges, training |
| **Jade** (premium) | Achievements, progress chests, daily tasks, ads | Chests, patrol speed-up |

**Copper is deliberately scarce, so players replay cleared chapters.**

- Copper per run scales with chapter and wave reached (*tune*: 10 × (1 + 0.5 × (chapter − 1))
  per wave, i.e. a full clear pays 500 in chapter 1, 1000 in chapter 3, 1500 in chapter 5).
- Pushing an uncleared chapter usually ends early and pays little; a clean run of the highest
  cleared chapter pays the most per minute. **Farming the latest cleared map is the intended
  loop** until gear catches up.
- Replays pay full copper and drop gear (the merge supply). Higher chapters drop higher tiers.
- No sweep/auto-clear: copper is earned by playing.
- Patrol gives mostly gear and only a little copper (*tune*: 5 % of a full clear of the highest
  cleared chapter per hour, one item per 6 h, 12 h cap).
- Rewarded ad on results doubles copper; this is the main ad placement.

## Retention

- **Patrol:** idle income, 12 h cap, scaled by the highest cleared chapter. Ad doubles it or
  grants 2 h instantly.
- 3–5 daily tasks (e.g. "kill 1000 mobs").
- One free chest per day.
- Achievements (also the sutra source). Implemented as a second page of the tasks panel
  (`client/src/meta/achievements.ts`, goals in `balance.json` `achievements`): 27 long-term
  goals (runs, lifetime kills, chapter and hard-mode clears, Codex entries, level, training,
  gear tier, monks), each paying jade once, about 800 in all. Progress is read from the save,
  so goals reached earlier wait to be claimed; ready ones list first, with a Claim all.
- Daily and weekly challenges (both built, with mutators): see "Challenges" below.

## Challenges (daily and weekly built)

Two shared runs on top of the chapters, built on what the deterministic engine already gives:
the same config and commands replay tick for tick, so a run can be checked by the server and
watched by other players. Why: on CrazyGames 75 % of new installs start only one run
(docs/retention.md), and the meta systems above do not reach them; the daily challenge is the
one long-term feature that is also a day-0 reason to come back tomorrow. The weekly one gives
veterans something past hard mode that costs no new art.

### Daily and weekly: two different jobs

| | Daily | Weekly |
|---|---|---|
| Job | A habit and a reward: "come back tomorrow" | A competition and a lesson: "see how the best play it" |
| Run | 20 waves of the player's furthest unlocked chapter, ending on the mid-boss (about 5 min) | One full chapter run, 50 waves (about 12 min) |
| Same for everyone | Seed and the day's mutator | Seed, chapter, mutator and the whole loadout (below) |
| Player's own | Monk, relic, sutras, gear, training | Nothing |
| Attempts | The first finished run of the UTC day counts; later runs are practice and pay nothing | Unlimited; the best run counts |
| Ranked by | Reward milestones by wave reached; a board per chapter, shown as "top N %" | `runScore` (won, then wave, then time) on one board |
| Pays | Milestones (below) | Participation and a rank tier, settled after the week |
| Replays | Kept for verification only | Top 3 published, with their pick timeline |

- **UTC days and weeks** (Monday 00:00 UTC), unlike daily tasks, which follow the device's
  local date: a shared board needs one clock. The server's time decides; the client shows the
  time left from the server's answer.
- **No revives** in either: a rewarded-ad revive would buy rank, and the ad-free card and
  CrazyGames' Basic Launch pay it out free. Training's free revives are off too.
- **Mutators** are one per challenge, from a small list the engine knows (`RunConfig.mutator`,
  `engine/mutators.ts`, numbers in `MUTATORS`): `elites` (one more of the first elite on every
  elite wave), `swift` (the horde walks at 125 %; elites and bosses as before) and `glass` (half
  the base health, double XP). Sutra cards only is still an idea. The daily's rotates by the UTC
  day (`dailyMutator` in `server/src/challenge.ts`), so no two days in a row share one; a weekly
  has one when its entry in `server/src/weeklies.ts` names it (the rotation's fallback weeks
  have none). The panel shows it in saffron above the rules ("Swift horde: the horde moves
  faster"); a client that does not know a newer server's mutator id is on an older engine and
  sees "update" anyway. The server refuses a run whose config's mutator is not the record's.

### The weekly loadout

Fairness and learning both need every player to have the same options, so the weekly
challenge fixes the whole run config, not just the gear:

- `bonus` all zero: no gear, no training (`?bare` already plays this way).
- Relic and monk set by the challenge ("this week: alms bowl, fat monk"), whether the player
  has unlocked them or not; trying a locked relic here is also a preview of what is coming.
- Sutras: a fixed set from the challenge, so the card pool is the same for everyone and a pick
  in a replay is a pick the viewer could make.
- Chapter: any of 1–5, whatever the player has cleared (it opens after chapter 1). Hard mode
  only as a later variant.

### Challenge records and engine versions

The server owns the challenge list (`GET /v1/challenge`): id (`d20261019`, `w2026-43`), kind,
start and end, seed, chapter or "furthest", mutator, the weekly loadout, and the engine version
it runs on. The client builds its `RunConfig` from that record alone.

A replay only plays back on the `ENGINE_VERSION` it was recorded with (engine/replay.ts), and
that number moves often. So:

- **Boards are keyed by challenge and engine version.** A client asks for, and sends to, the
  board of its own version.
- **Engine changes ship on Mondays** by convention, with the new weekly challenge, so a week
  normally has one board. An urgent mid-week engine fix starts a second board for the rest of
  the week; both pay out, each by its own ranks.
- Hosts that lag (CrazyGames uploads by hand, WeChat review) play on the board of the version
  they have. A client whose version has no board this week shows the challenge as "update to
  play" rather than a broken run.
- Published replays are listed only to clients of the same version. Last week's top 3 stay
  watchable while the engine is unchanged.

### Submitting and verifying a run

A challenge run sends its `RunEntry` together with its replay (`ReplayWire`, the same format
as problem reports). The server today checks runs for plausibility only (`server/src/rules.ts`
`checkRun`); challenge runs are re-simulated:

- The server takes `@hk/engine` as a dependency (it is pure TypeScript with no imports outside
  itself) and steps the replay to its end in a worker, off the request path. The run's final
  `hashState` and outcome must match what the client sent; then it enters the board. A
  mismatch is refused (no ban: it may be a determinism bug) and logged for the operator, as a
  problem report with the replay.
- Only runs that would rank in a board's top 100 are re-simulated (about 23 000 ticks for a
  weekly run); the rest keep the plausibility check and show no replay.
- Re-simulation also produces the **pick timeline** that the board shows: for each level-up and
  shrine, the tick, the wave, the three cards offered and the one taken, and each evolution.
- Before launch: check the golden hash in Safari (JavaScriptCore) and WeChat on iOS
  (engine/README.md lists that as untested). A runtime that diverges would see every good run
  refused.

### Watching a replay and the pick timeline

- The weekly board's top 3 rows have a Watch button. The replay downloads on demand
  (measure the size of a full 50-wave run; gzip on the wire; `LIMITS.replayNumbers` is the cap).
- The replay screen reuses the run view, fed by `ReplayInputSource` instead of the player:
  play, pause, 1x / 2x / 4x, and jump to a wave (stepping the engine without drawing). No HUD
  buttons that do nothing; the hero's stick is drawn so the viewer sees how they moved.
- Under the board (and under the replay), the **pick timeline**: one row of card icons in
  order, tapping one jumps the replay there. This is often what a player wants to learn, and it
  needs no replay download.

### Rewards

Numbers are *tune* values and live in `balance.json` under `challenge`, like everything else.

- **Daily milestones** on the counted run: waves 5, 10, 15 and 20 (the mid-boss down) each pay
  copper and a little jade; together about one normal full-clear's copper of that chapter, so
  the challenge sits beside farming instead of replacing it. A rewarded ad doubles the copper,
  as on a normal results screen.
- **Weekly participation**: one finished run pays jade.
- **Weekly rank tiers**, settled once the week is over and claimed at the next launch: top
  50 %, top 10 %, top 3. Jade, plus a cosmetic mark next to the name on the boards for the
  next week (top 3: gold, with their replay). No stat items: a reward that adds power would
  leak into a competition built on everyone having none.
- Rewards are written to the local save like any other. The server only answers the rank;
  someone who forges it cheats only themselves, as with the clock.
- Achievements can follow later (first daily, a 7-day streak of dailies, a weekly top 10 %).

### Platforms

Challenges need the server. They are hidden where the game plays offline (Playgama's sandbox,
development without `?api`) and while the backend does not answer, rather than shown broken.
WeChat reaches the server already; its review may lag a version behind, which the version-keyed
boards absorb.

### Order of work

1. **Server** (built, but for the cross-runtime check): challenge records (`GET /v1/challenge`,
   the daily from the UTC date, the weekly from `server/src/weeklies.ts` with a rotation as the
   fallback), boards keyed by challenge, engine version and chapter, run plus replay intake (a
   weekly keeps each install's best: `lower` for a run no better), the re-simulation queue with
   the pick timeline, the top 3 verified weekly runs with their replays
   (`GET /v1/challenge/boards/<board>/replays/<tag>`), and last week's tiers as a `mark` on
   every board's rows (`server/src/marks.ts`). There is no settlement job: once a week is closed
   and its runs re-simulated, its board is final and a client asks for its own row. Still to
   do: the golden hash in Safari (JavaScriptCore) and WeChat on iOS (engine/README.md).
2. **Daily, client** (built): the challenge tile beside PLAY from player level 2
   (`ui/challengePanel.ts`), the run from the record with the player's loadout and no revives
   (`meta/challenge.ts`), the counted run sent with its replay (`ui/challengeFlow.ts`), milestones
   on its results with "next challenge in Xh" (`ui/ChallengeResultsScreen.ts`), the board as
   "top N %". The milestones count the waves cleared (5/10/15/20). A challenge run is never kept for the next
   launch, so closing the game mid-run leaves the day open; `run_start` and `run_end` carry
   `challenge` (the id). `?challenge` shows a daily made up on the device when offline.
3. **Engine** (built, `ENGINE_VERSION` 39): a run whose last wave is a mid-boss wave (the
   daily's 20) ends as a win once that mid-boss falls (`isMidBoss(wave, last)` in
   `engine/systems/waves.ts`; the story's last line is the mid-boss's), and the mutators above.
   The HUD counts the run's own waves ("Wave 3/20"). Ship it on a Monday: a version bump starts
   new boards, so pushing it mid-week splits that week's.
4. **Weekly, client** (built): a Weekly tab in the challenge panel (the tile
   shows the weekly when there is no daily) once chapter 1 is cleared (`ui/weeklyPage.ts`): the
   week's relic, monk and sutras, owned or not, no gear, training or revives
   (`meta/weekly.ts` `weeklySetup`), unlimited attempts with the week's best kept in the save
   and sent when it is at least as good. Its results show a new best or the best that stands,
   and the rank. The board shows 12 rows; the top 3 have Watch and a tap shows their pick
   timeline under it, a tap on a pick watches from there (`ui/weeklyBoard.ts`). The replay
   screen (`ui/replayWatch.ts`) plays the run view in a watch mode: play and pause, 1x/2x/4x,
   a wave back or on, and the pick timeline, where a tap seeks (`ui/replaySeek.ts`: a bare
   engine stepped a slice a frame). Only clients of the record's engine version play or watch;
   others see "update". A closed week is claimed at the next launch (a card over the lobby):
   participation 10 jade, then +10 / +30 / +80 for the top 50 % / 10 % / 3 (`balance.json`
   `challenge.weekly`), and the tier shows as a medal beside the name on the next week's boards.
   A full 50-wave replay is about 110 KB of JSON, about 30 KB gzipped. `?challenge` also makes
   up a weekly offline; `?challenge=settle` treats the saved weeks as closed (offline: rank 2
   of 10) to see the claim.
5. **Measure** (docs/retention.md): `challenge_start` / `challenge_end` events, and D1 / D7 of
   installs that played a challenge on day 0 against those that did not.

## Ads and monetization

| Placement | Where | Note |
|---|---|---|
| Revive | Run | Once per run |
| Double results | Results | Main revenue |
| Patrol double / instant | Lobby | Brings players back |
| Ad chest | Shop | 3 per day |
| Interstitial | Results → lobby (not after the first run) | Per platform rules (CrazyGames `requestAd('midgame')`) |
| Banner | Lobby, every tab | 320×50 in a band under the tab bar, which moves up to keep it clear; down in runs and on results; at most one request per 30 s (`platform/web/banner.ts`) |

- No reroll ad on the in-run pick: it breaks the pace.
- Ads only on the web and WeChat. iOS sells one thing, the **ad-free card** (US$3.99, once):
  rewarded offers pay out without an ad and interstitials stop, but every daily cap stays, so
  balance never prices in a paying player (`docs/ios.md`). Jade packs and a battle pass need a
  server account and cloud save first; IAP on WeChat needs a licence check first.
- CrazyGames' Basic Launch serves no ads: there the rewarded offers pay out without one, like
  the ad-free card, until Full Launch turns the ads on (`docs/store.md`).

## Platforms, saves and server

First release targets **CrazyGames** (SDK v3). The plumbing exists in `D:\daydayup`
(`client/src/platform/crazygames/`, `design/20-game-portals.md`, which lists the platform
rules and four live SDK findings); adapt it rather than rewrite it.

**CrazyGames rules that shape the design:**

| Rule | Consequence here |
|---|---|
| New users land in gameplay within 1 click; ≤20 s to gameplay | First launch goes straight into chapter 1; afterwards PLAY is the default lobby tab |
| ≤50 MB initial download (≤20 MB for the mobile homepage) | Boot loads lobby + chapter 1 only; other chapters load in the background |
| Ads only through the SDK, never interrupting gameplay | Interstitials only on results → lobby; game muted and frozen during any ad |
| Adblocked players play normally | Rewarded offers are hidden, not shown disabled |
| Banners only on menus open 5 s or more | At most one banner, on the lobby, in its own band so it covers no UI |
| English mandatory, detect the user's language | See Localization |
| Signed-in users are signed in automatically and see their username; guest progress carries over on sign-in | Use the SDK account + data module; no login screen |
| IAP only for invited games, through the platform | No IAP anyway |

Open: whether a rewarded revive on the death screen counts as interrupting gameplay. Gameplay
is stopped at death and the player opts in, so it should be fine; confirm during review.

**No own server in the first version:**

- **Saves** sit behind one `SaveStore` interface. On CrazyGames it is the SDK data module
  (cloud for signed-in players, local for guests, carried over on sign-in), which also covers
  browsers that block third-party `localStorage`. The SDK initialises asynchronously, so boot
  waits for it (bounded at 3 s, as in daydayup) **before** reading the save. The save carries a
  format version for migrations; settings (quality, volume, language) are local only.
- **Clock:** patrol and daily resets use the device clock. Cheating only affects the player
  themselves; a clock that moved backwards simply pays nothing.
- **Balance data** (merge costs, copper rates, drop tables, ad caps) lives in data files, never
  in code, so it can move to remote config later without a rewrite.
- **Analytics:** the CrazyGames developer dashboard first. Our own events (death wave per
  chapter, runs per day, time between merges, ad view rate) go to our server (server/), and the
  lobby's settings panel says so in a short data notice whenever the game is online.

**WeChat share:** the capsule menu forwards to a chat (a 5:4 card cut from the store cover,
`client/wechat/share/<lang>.jpg`, and a one-line pitch) and to Moments (the pitch over the icon).
No share rewards: WeChat bans incentivised sharing.

A small server on the existing VPS comes with WeChat: `code2session` login (the app secret
must not ship), cloud save, server time, remote config, analytics. Leaderboards later can
re-simulate submitted runs with the deterministic engine to verify them.

**Poki later:** Poki wants exclusivity, so moving there would mean taking the game off
CrazyGames; the `SaveStore` and ad interfaces must not assume CrazyGames.

**Save contents** (well under 50 KB): player level and XP, copper, jade, gear counts per item
and tier (the best is worn), training nodes bought, per-chapter best wave, claimed chests and last fall (the wave of the latest lost run, cleared by a win), unlocked relics / sutras / codex
entries, daily tasks and ad counts, patrol start time, lifetime kills and claimed achievements, save version.

## Localization

- Every player-facing string comes from a string table keyed by id; no literal text in game
  code. Numbers and plurals go through one formatter.
- Languages: **English** (default), **Simplified Chinese**, and since 2026-10-06 German,
  French, Spanish, Italian, Portuguese (BR), Polish, Russian, Japanese and Korean; since
  2026-10-12 Vietnamese, Turkish, Thai and Indonesian, the untranslated countries that brought
  a quarter of CrazyGames' first installs (`client/src/i18n/more.ts`; the WeChat build ships en and zh only, for its 4 MB main
  package). Picked in the lobby's settings or on the pause panel (`ui/languagePanel.ts`); the
  tables and layouts must not assume a language count.
- Language order: saved setting → platform / browser language → English.
- The tables in `client/src/i18n/<lang>.ts` are shared by both games; the strings that name a
  game's world (heroes, relics, chapters, currencies, the story) sit in its theme's own tables,
  `i18n/monk/` and `i18n/corgi/`, and a build carries only its own (docs/reskin.md "Words").
- **One word per concept, in plain words**, the same in every table: enemies (敌人; not
  monsters, foes or 怪物; a crowd of them is the horde / 敌群), spells (法术) for the skill
  cards, including the ones a sutra unlocks (the sutra is the achievement, not a word players
  see), relic (法器), "Lv." for levels. No design jargon on screen: a challenge is "everyone
  plays the same run", never a seed. Start buttons say Play (出战); the replay's play is
  only for watching runs.
- Layouts leave room for about 30 % longer text (German, Russian). Damage numbers are digits
  only and need no localization. Text that does not fit wraps and its box grows (the squad
  panel's rows do); `fit()` shrinking is for short labels, and a label it would squeeze far
  below its size gets a shorter word in that language (the bottom tabs' "Equip.", "Entraîn.").
- Names put together from parts never assume English order: a gear item of a tier is
  `gear.drop` ('{tier} {item}' in English, '{item} {tier}' in the Romance languages), and the
  tier picks the form that agrees with the item from its '|' forms by `gear.form` (gender and
  number in es/fr/it/pt, gender in de/ru/pl; the first form is the tier standing alone).
- Glyphs: system fonts on web (Japanese, Korean and Thai put their own fonts first, `ui/widgets.ts`); check CJK coverage and size on the WeChat build.
- Wrapping breaks only at spaces (else between characters), so the Thai table leaves a space
  between phrases where Thai writing allows one.

## Lobby layout (portrait, 5 bottom tabs)

```
┌──────────────────────────────────┐
│ avatar Lv.12   copper 12.3k  jade 340  ⚙ │
│      ( Normal | Hard )           │
│   ‹ [Chapter 3: XX Mountain] ›   │
│      best: wave 37               │
│      ▢ ▢ ▢ ▢ ▢  progress chests   │
│ (Patrol)                (Daily)  │
│  3h 0m      (the monk)   16h left│
│ (Tasks)                 (Gift)   │
│      Relic: …   ◯ ◯ ◯ ◯ ◯        │
│ [            PLAY             ]  │
├──────┬──────┬──────┬──────┬──────┤
│ Shop │ Gear │ Play │ Train│ Codex│
└──────┴──────┴──────┴──────┴──────┘
```

One loud thing per screen: PLAY is the only full-width button, at the thumb, and the active tab
the only other saffron surface. The hero wears flat saffron, so PLAY is glossy instead (gold
running to deep orange, its word outlined, a glint sweeping across it every few seconds,
`ui/lobbyPlay.ts`). Everything else on the Play tab is quiet:

- The side things (Patrol and Tasks left, the daily or weekly challenge and the welcome gift
  right) are one family of round dark badges, `ui/lobbyRail.ts`: the picture, its name under it
  and a short line under that (hours stored, time left). A saffron ring means "this wants you
  now" (a challenge open, a gift ready); greyed means locked or done for today.
- A red dot means something can be claimed; the open tab never shows one, since its own screen
  shows what is waiting. While a new player's arrow points at a tab (`ui/lobbyHint.ts`), the other
  tabs' dots wait, so a fresh save has one next step instead of four. A patrol that has only just
  set out says so instead of "0h 0m".
- The chapter arrows come in a pair, the one that cannot move faded, so the card stays centred.
- The hero takes the height between the card and the relic row, so he stays the picture's subject,
  on a faint pool of light (`ui/lobbyStage.ts`).
- Three value layers, each with one job: the dark bars frame the screen, the backdrop is a stage
  set (drawn 40% greyer and flatter than painted, `STAGE_TONE` in `ui/lobbyBars.ts`), and the
  light things on it (the chapter card, the relic and rail badges, `BADGE` in `ui/playCard.ts`)
  are what the player reads. No dark disc on the bright courtyard: it was the strongest contrast
  on screen and pulled the eye off the hero. Inside the card, only the title wears an outline.
- Icons are all painted objects in the sticker style, one per meaning: no spell or stat icon is
  borrowed for a lobby button (the daily is a trophy, Train a wooden post, the corgi's a kettlebell).
  The top bar's die and cog are painted too, not drawn in code or a font glyph; the cog stays steel
  grey, the one thing that must read as "settings" at a glance.
- Icons share one optical size: the sheet packer shrinks a solid picture (a book, a chest) inside
  its cell until it weighs about what a thin one does (`FILL` in `tools/pack_icons.py`), so
  every caller can size icons by their cell alone.
- Out of reach is a grey silhouette, not a faded picture (`lockedLook` in `ui/buildBar.ts`):
  locked relics, tabs and rails, gear not owned, codex entries not found. A collected chest
  stays faded, since "already taken" is another meaning.
- Red dots wear a white ring inside their outline, so they still read on a red picture.
- A progress chest not reached yet is a muted red, so five of them do not compete with PLAY; the
  one waiting is full colour on a saffron halo.
- Lobby text keeps the 48 floor (the rails' second line 44): the tab names, the rails' names, the
  player's name and level.
- The menu tabs (Shop, Train, Codex) are a menu layer over the courtyard: the picture goes
  out of focus and dusk-dark behind them (`MENU_TONE`, baked once into a texture by
  `menuBackdrop`, since a blur every frame costs a low-end phone its frame rate), so their dark
  panels sit on it as the bars do. Their content hangs from a fixed line under the top bar
  instead of being centred, so a title stays put when the tabs switch. Gear keeps the daylight
  courtyard: the monk stands on it among his gear, a stage like Play, with no dark panels.
- The Shop tab's cards share the room down to the tab bar: how many there are depends on the
  host (no ad chest without an ad, the ad-free card only on iOS), so with fewer cards each one
  grows (290 up to 400 tall, a bigger chest) instead of leaving a bare floor. Under them a line
  counts down to the local midnight when the daily chests refill (`untilNextDay`), the thing a
  player who has used them up wants to know.
- A lobby toast (a locked tab's reason, a copied id) is a dark pill over the tab bar, so it reads
  as a passing message and not as a loose line of the tab under it.
- The Train tab's board (`ui/trainTab.ts`, `ui/trainBoard.ts`) is a dark panel of its own, its
  title on it, so the backdrop never shows between nodes. The nodes come in pages of 50
  (`valueStep`), picked by tabs on the title band; the page shown is the next node's. Each page
  snakes in rows of ten along one road, lit as far as the training has come. The second page's tab
  and each of its nodes' cards wear a gold ×2, so the doubled values read before anything is bought. Three states, told apart at a glance: trained is
  the stat's icon in full colour on a lit badge ringed in its stat's colour; the next one is a
  bigger lit badge in a saffron ring that slowly breathes; the rest are grey silhouettes
  (`lockedLook`) on dark discs. A picked node wears a white ring, and its card with the Train
  button sits under the board. "Stats from training" only appears once something is trained.

The backdrop is a daylight courtyard (the corgi: a sunset desert base), drawn without a dark
veil so the lobby reads bright and warm. On the Play tab the chosen monk stands centre stage
between the chapter card and the relic row, breathing in his idle clip; a tap makes him kick
(the corgi fires, left and right in turn) with a little hop. Maple leaves drift down over every
tab (the corgi: motes of light rising). The maths is `ui/lobbyAmbient.ts`, the views
`ui/lobbyStage.ts` and `ui/playCard.ts`.

The Gear tab is a paper doll (`ui/gearDoll.ts`, `ui/gearTab.ts`): the same figure stands in the
middle, his six slots three a side as light round badges of the rail family (weapon, wrists and
waist left; neck, body and feet right), the tier's colour as the badge's rim, a jade dot when five
alike wait to merge. Under each badge the item's name, one size (48) for all, wrapping to a second
line rather than shrinking (only a single word wider than the column shrinks), and its tier (40).
"Merge all" stands at the hero's feet only when something can merge; otherwise a quiet line there
says how merging works. What the gear adds up to is a light card under the doll. The tab's top is
at y = 0 and `gearHeight` is its whole height.

## Ambient life

The battlefield should never look frozen, even on an empty screen:

- Grass, reeds, bushes, shrubs and (barely) pines lean in a breeze with gusts rolling across the
  field, and part round the hero's feet, springing back after he passes (`game/sway.ts`, drawn in
  `game/decoView.ts`). Only props near the camera move.
- Nothing drifts over the battlefield: no snow, leaves, fireflies or ash across the whole
  screen, which reads as noise over the horde and the hero. A chapter's feel comes from its
  ground, props and (chapter 2) the low mist under the figures. Decorative motion belongs where
  the player is not fighting: the lobby's falling leaves and rising motes (`ui/lobbyAmbient.ts`).
- All of it is view-side and runs on the real clock; the engine never knows.

## Pacing targets

- Chapter 1: the first try is lost in 5–10 minutes (waves 20–40) and sends the player to the
  lobby; cleared in 2–5 tries, on the first or second day.
- Chapter 2: 5–10 tries.
- Chapter 3 on: requires farming the previous chapter for gear and copper, a few days per
  chapter.
- All 5 chapters: about 2 weeks with ads, 3–4 without; then hard mode, about 3–6 weeks more;
  then new chapters.

**Measured** (2026-10-05, ENGINE_VERSION 30, `npm run journey`: the casual bot from a new
save, merging, training, using the shop, patrol and daily tasks between runs and always
pushing the highest open chapter; no revives; 6 seeds). Days to clear, median (range):

| Player | Ch 1 | Ch 2 | Ch 3 | Ch 4 | Ch 5 |
|---|---|---|---|---|---|
| 2 sessions × 2 runs a day, every ad | 1 (1–2) | 2 (2–4) | 4.5 (4–6) | 7.5 (6–9) | 12 (8–15) |
| 2 sessions × 1 run a day, no ads | 2 (1–3) | 5 (4–7) | 9 (7–11) | 16 (12–19) | 26.5 (15–30) |

**Measured again** (2026-10-06, ENGINE_VERSION 31: spawns ahead of a running hero, crowd
blows, an elite every 5th wave and mid-bosses on 20 and 35, `hpSquare` 85; content.md
"Pressure"), same setup and seeds:

| Player | Ch 1 | Ch 2 | Ch 3 | Ch 4 | Ch 5 |
|---|---|---|---|---|---|
| 2 sessions × 2 runs a day, every ad | 1 (1–2) | 3.5 (2–4) | 7 (5–10) | 10.5 (8–15) | 15 (12–20) |
| 2 sessions × 1 run a day, no ads | 1 (1–2) | 4 (2–5) | 8.5 (6–12) | 11 (9–17) | 15.5 (12–26) |

**Measured again** (2026-10-07, ENGINE_VERSION 34, same setup and seeds):

| Player | Ch 1 | Ch 2 | Ch 3 | Ch 4 | Ch 5 |
|---|---|---|---|---|---|
| 2 sessions × 2 runs a day, every ad | 1 | 3.5 | 8.5 | 13.5 | 18 (13–24) |
| 2 sessions × 1 run a day, no ads | 2 | 7.5 | 17.5 | 26.5 | 44 (36–54) |

The no-ads row of the 2026-10-06 table does not reproduce: the ENGINE_VERSION 31 commit run again
the same way clears chapter 5 on days 26–42 (median 36, 1 of 6 not by day 45), so most of the gap
was already there. Of the later changes, elites that only become targets once on screen
(13a30ac) cut a chapter 4 try's damage by about 14%. The walls are the last chapters' bosses: the
Judge ends chapter 4's lost tries on wave 49, and chapter 5's on the wave 20 mid-boss or the
Inner Demon. Both players are slower than the targets above; this is kept for launch on purpose,
and the last two chapters get tuned from the players' numbers (docs/retention.md) rather than
the bots'.

ENGINE_VERSION 30 made the curve harder: at 26–29 the casual bot won chapter 1 on its first
try and took next to no damage, and the clears came on days 1/1/2/4/8 with ads and 1/2/4/8/16.5
without (docs/content.md "A harder curve").

Before ENGINE_VERSION 26 the no-ads player had cleared chapter 5 in 2 of 6 journeys by day 45:
the chapter 4 and 5 bosses were all but unkillable through their horde, and a try died on the
first elite or the mid-boss or else won, so luck set the pace. The levers now:

- In the run: mob health and every hurt by chapter (`HORDE.chapterHp`, `HURT.chapterPercent`),
  ramped in over the run (`CHAPTER_RAMP`: a later chapter starts near chapter 1 and is at its
  hardest by the last boss), so a try's reach grows with the hero's strength rather than
  falling to a coin toss at one wave. Lost tries on chapter 5 now end anywhere from wave 17 to
  the Inner Demon on 49.
- Grit (`BALANCE.grit`, loadout.ts): every lost try of at least 5 waves on the first uncleared
  chapter adds +3 % attack and +4 % health there, up to 20 times; clearing it starts over. It
  turns a long run of bad luck into a few more tries and is the main pacing lever for the last
  chapters (at +4/+6 the ads player cleared chapter 5 on days 5–7).
- The lobby's gear: one patrol item per 6 h, 1 item per ad chest, the jade chest 80 jade for 3.

**Hard mode measured** (2026-10-05, ENGINE_VERSION 30, the same journeys run on through hard
mode, 60 days; 6 seeds). Day the hard chapter is cleared, median (range):

| Player | Hard 1 | Hard 2 | Hard 3 | Hard 4 | Hard 5 |
|---|---|---|---|---|---|
| 2 sessions × 2 runs a day, every ad | 16.5 (12–28) | 20 (15–38) | 31 (22–43) | 44 (27–51) | 49 (42–59; 1 of 6 not by day 60) |

The no-ads player was last measured at ENGINE_VERSION 27 (hard 5 on day 54.5, 52–66) and has
not been run again since the harder curve.

Lost hard tries end anywhere from wave 10 to 48. A first pass with elites and bosses at 5–10×
their health (`HARD.foeHp`) made the last boss the wall (most lost tries died on wave 49), so
the walls are now in the horde (`HARD.hp`, `HARD.hurt`) and grit; those three are the levers.
