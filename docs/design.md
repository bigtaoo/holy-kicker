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
  CrazyGames does not work out. Ads only on every platform: **no IAP** in the
  first version. **No stamina** anywhere. No gacha.
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
| End of first run | Play, Gear (first run always drops one item) |
| Player level 2 | Training (talents) |
| Chapter 1 cleared | Shop, Patrol (idle income), second relic |
| Chapter 2 cleared | Codex |

## Chapters (the run)

A chapter is one map with 50 waves of about 15 s each. Dying restarts the chapter; the best
wave reached is recorded.

| Wave | Content |
|---|---|
| 1–9 | Regular hordes, ramping up |
| Every 5th (5, 15, 25, …) | **Shrine**: pick one — heal, or an extra skill |
| 10 / 20 / 30 / 40 | **Elite wave**: 1–3 elites that force movement |
| 25 | Mid-boss (may reuse the previous chapter's boss, empowered) |
| 50 | **Chapter boss** (chapter 1: the fallen abbot) |

- In-run levelling: XP orbs, pick 1 of 3 on level-up (relic upgrade / spell / passive).
  Specific spell + passive pairs **evolve**.
- Death: one rewarded-ad revive per run; otherwise results are paid by the wave reached.
- **Progress chests** at waves 10/20/30/40/50 of each chapter, claimable once each, so a
  failed push still pays.
- Clearing a chapter unlocks the next. Clearing chapter 5 opens hard mode.
- **Launch with 5 chapters.** Each needs a ground, 3–4 mob types, 1–2 elites and a boss.

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

### Hard mode

The endgame after chapter 5, so a player who has cleared everything still has a climb (about
3 more weeks with ads, 5–6 without; see "Pacing targets").

- **Opens** when chapter 5 is first cleared: the results say so and the lobby moves to hard
  chapter 1. A Normal / Hard switch then sits above the chapter card; hard chapters unlock one
  by one like the normal ones.
- **The same five chapters, tougher** (engine `HARD`, `RunConfig.hard`): mob health and every
  hurt take hard mode's own percents by chapter (ramped in over the run like the normal ones),
  elites and bosses have 3.5–4.5× their health, and every elite wave brings one elite more.
- **Its own progress**: clears, best waves and progress chests are kept apart from the normal
  chapters (`hardCleared`, `hardBest`, `hardChests` in the save).
- **Better pay**: hard chapter n counts as stage 5 + n (progress.ts `stage`), so its copper,
  chests and gear drops continue the normal chapters' growth (`dropTiers` rows 6–10 bring
  more Treasured and Sacred items), and so do patrol and the shop once a hard chapter is cleared.
- **Grit** gathers on the first uncleared chapter of the whole climb: the last normal one, then
  the first uncleared hard one.
- Relics and sutras come from the normal chapters only.

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

**As built** (`client/src/meta/training.ts`, `balance.json` "training"): 50 nodes; node n opens at
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
- Achievements (also the sutra source).

## Ads and monetization

| Placement | Where | Note |
|---|---|---|
| Revive | Run | Once per run |
| Double results | Results | Main revenue |
| Patrol double / instant | Lobby | Brings players back |
| Ad chest | Shop | 3 per day |
| Interstitial | Results → lobby (not after the first run) | Per platform rules (CrazyGames `requestAd('midgame')`) |

- No reroll ad on the in-run pick: it breaks the pace.
- Ads only on all platforms. IAP (ad-free card, battle pass, jade packs) is a later option for
  WeChat and needs a licence check first.

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
| Banners only on menus open 5 s or more | At most one banner, on the lobby |
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
  chapter, runs per day, time between merges, ad view rate) need a server and a one-line data
  notice in the lobby.

A small server on the existing VPS comes with WeChat: `code2session` login (the app secret
must not ship), cloud save, server time, remote config, analytics. Leaderboards later can
re-simulate submitted runs with the deterministic engine to verify them.

**Poki later:** Poki wants exclusivity, so moving there would mean taking the game off
CrazyGames; the `SaveStore` and ad interfaces must not assume CrazyGames.

**Save contents** (well under 50 KB): player level and XP, copper, jade, gear counts per item
and tier (the best is worn), training nodes bought, per-chapter best wave and claimed chests, unlocked relics / sutras / codex
entries, daily tasks and ad counts, patrol start time, save version.

## Localization

- Every player-facing string comes from a string table keyed by id; no literal text in game
  code. Numbers and plurals go through one formatter.
- Launch languages: **English** (default) and **Simplified Chinese**. Add more from
  CrazyGames traffic data (daydayup already ships de, es, fr, it, pl, ru); the tables and
  layouts must not assume a language count.
- Language order: saved setting → platform / browser language → English.
- Layouts leave room for about 30 % longer text (German, Russian). Damage numbers are digits
  only and need no localization.
- Glyphs: system fonts on web; check CJK coverage and size on the WeChat build.

## Lobby layout (portrait, 5 bottom tabs)

```
┌──────────────────────────────────┐
│ avatar Lv.12   copper 12.3k  jade 340  ⚙ │
│                                  │
│      [Chapter 3: XX Mountain]    │
│      best: wave 37               │
│      ▢ ▢ ▢ ▢ ▢  progress chests   │
│                                  │
│           [ PLAY ]               │
│      patrol chest (6 h stored)   │
├──────┬──────┬──────┬──────┬──────┤
│ Shop │ Gear │ Play │ Train│ Codex│
└──────┴──────┴──────┴──────┴──────┘
```

## Pacing targets

- Chapter 1: cleared in 1–2 tries, inside the first session.
- Chapter 2: 3–5 tries.
- Chapter 3 on: requires farming the previous chapter for gear and copper, about 1–2 days per
  chapter.
- All 5 chapters: about 2 weeks; then hard mode, about 3–6 weeks more; then new chapters.

**Measured** (2026-10-05, ENGINE_VERSION 26, `npm run journey`: the casual bot from a new
save, merging, training, using the shop, patrol and daily tasks between runs and always
pushing the highest open chapter; no revives; 6 seeds). Days to clear, median (range):

| Player | Ch 1 | Ch 2 | Ch 3 | Ch 4 | Ch 5 |
|---|---|---|---|---|---|
| 2 sessions × 2 runs a day, every ad | 1 | 1 | 2 (2–3) | 4 (3–6) | 8 (6–9) |
| 2 sessions × 1 run a day, no ads | 1 | 2 (1–2) | 4 (3–7) | 8 (7–10) | 16.5 (9–26) |

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

**Hard mode measured** (2026-10-05, ENGINE_VERSION 27, the same journeys run on through hard
mode; 6 seeds). Day the hard chapter is cleared, median (range):

| Player | Hard 1 | Hard 2 | Hard 3 | Hard 4 | Hard 5 |
|---|---|---|---|---|---|
| 2 sessions × 2 runs a day, every ad | 9.5 (8–11) | 13 (12–15) | 20 (17–22) | 24 (19–26) | 27.5 (21–42) |
| 2 sessions × 1 run a day, no ads | 22 (12–28) | 26 (20–35) | 37.5 (26–46) | 43.5 (35–49) | 54.5 (52–66) |

Lost hard tries end anywhere from wave 10 to 48. A first pass with elites and bosses at 5–10×
their health (`HARD.foeHp`) made the last boss the wall (most lost tries died on wave 49), so
the walls are now in the horde (`HARD.hp`, `HARD.hurt`) and grit; those three are the levers.
