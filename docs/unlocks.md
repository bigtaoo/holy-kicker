# Unlocks across the twenty chapters

Status: **approved and built (2026-10-22)**, except the lobby ambience (waits for a look approval).
Code: `client/src/meta/unlocks.ts` (schedule, migration, blessings), `chapterCard.ts` (teasers),
`resultsUnlocks.ts` (the unlock strips on the results).

## The problem

The journey is twenty chapters (about 60 days, four acts of five chapters), but everything a
player can unlock is out by chapter 4, most of it on day 1–2. From chapter 5 on only stars, hard
mode and the act rules are new. A player who has seen everything by day 2 has no reason on day
10 to wonder what comes next.

## What unlocks today, and when

| Unlockable | Gate today | Where it is read | Reached (casual journey) |
|---|---|---|---|
| Play, Shop, Gear | first run done | `progress.ts` `tabLock` | run 1 |
| Training | level 1 (`unlocks.trainLevel`) | `tabLock` | run 1 |
| Daily challenge | level 2 (`challenge.unlockLevel`) | `challenge.ts` | run 2 |
| Patrol | first run done | `patrol.ts` `patrolOpen` | run 1 |
| Weekly challenge | chapter 1 cleared | `weekly.ts` | day 1 |
| Codex | chapter 2 cleared (`unlocks.codexChapter`) | `tabLock` | day 1 |
| Relics: ball / staff / fish / beads / bowl | start / ch1 / ch2 / ch3 / ch4 cleared | `unlockedRelics` = `RELIC_IDS.slice(0, cleared + 1)`, `save.ts` clamp, `grantRelics` | **all by ~day 3** |
| Sutra Lotus Steps | wave 25 in any chapter | `balance.json` `sutras` | day 1 |
| Sutra Halo Beam | 1 Codex entry | same | day 1 |
| Sutra Lion's Roar | chapter 2 cleared | same | day 1 |
| Sutra Focus (passive) | 10 runs | same | day 1–2 |
| Fat Monk / Little Novice | 500 / 300 jade, any time | `monks.ts` | a few days of jade |
| Hard mode, chapter n | 3 stars on normal chapter n | `hardOpenAt` | from ~day 3 |
| Gear tiers Treasured / Sacred / Celestial / Divine / Supreme | first drop weight in `gear.dropTiers` at ch 6 / 9 / 13 / 16 / 19 | `rollItems` | spread out already, **but never announced** |
| Training page 2 (nodes 51–100) | player level 52 | `trainBoard` | rarely reached (level-gated) |
| Achievements (30, jade) | goals up to clear 20, hard 10 | `achievements.ts` | spread out |
| Act rules, story lines | chapters 6 / 11 / 16 | engine `acts.ts` | spread out (not choices) |

Open too early: all four sutras, all five relics, both monks. Spread already but invisible: the
gear tiers. Nothing else exists to unlock: there are no cosmetics, no lobby decorations, and no
spell or passive that is gated besides the four sutras (talisman, bomb and knives are in every
pool, and the fixed first run deals them).

## Proposed schedule

Rule: every act opens with a headline unlock and closes with one; star totals pay in between.
Everything in this table already exists or is client-only; nothing needs new art or an engine
change unless marked.

| When | Unlock | Kind | Change |
|---|---|---|---|
| start | Cuju Ball, Kicker Monk | relic, monk | — |
| ch 1 cleared | **Staff** | relic | unchanged |
| ch 2 cleared | Codex, **Lion's Roar** | tab, sutra | unchanged |
| ch 3 cleared | **Wooden Fish** | relic | was ch 2: the reward for the chapter-3 wall |
| wave 25 anywhere | Lotus Steps | sutra | unchanged (a day-1 hook for runs that fall short) |
| 10 runs | Focus | sutra | unchanged (weak passive, no point delaying) |
| ch 5 cleared (end of act 1) | **Little Novice** can be bought (300 jade) | monk | was buyable at once |
| ch 6 | Treasured gear starts dropping | gear tier | announced (exists) |
| ch 7 cleared | **Prayer Beads** | relic | was ch 3 |
| ch 9 | Sacred gear starts dropping | gear tier | announced (exists) |
| ch 10 cleared (end of act 2) | **Fat Monk** can be bought (500 jade) | monk | was buyable at once |
| ch 11 cleared | **Halo Beam** | sutra | was 1 Codex entry |
| ch 13 | Celestial gear starts dropping | gear tier | announced (exists) |
| ch 15 cleared (end of act 3) | **Alms Bowl** | relic | was ch 4 |
| ch 16 | Divine gear starts dropping | gear tier | announced (exists) |
| ch 19 | Supreme gear starts dropping | gear tier | announced (exists) |
| ch 20 cleared | finale (story exists) + the last star blessing below | — | — |
| 10 / 20 / 30 / 40 / 50 / 60 stars | **Star blessings**: a small permanent stat each, e.g. +2 % attack, +3 % health, alternating (numbers in `balance.json`, *tune*) | stat, client-only (`RunConfig.bonus`) | new |
| ch 5 / 10 / 15 / 20 cleared | **Lobby ambience** for the act reached: maple leaves (monk) / motes (corgi) → fireflies → snowflakes → gold petals | code-drawn specks (`lobbyAmbient.ts`) | new, **needs your look approval** (screenshots), no new image files |

Why these places:

- Chapter 3 is where players stop (memory: 13 of 20 stuck there leave after ~3 tries); a relic
  for clearing it is the strongest pull we can give without touching the difficulty. Chapters
  1–3 still give three new things on day 1.
- Each act's last chapter hands over a new way to play into the next act (novice, fat monk, bowl);
  the acts' own rules already make their first chapter feel new.
- Stars are what players replay for between first clears (median ~3 replays for a 3-star); a
  blessing every 10 stars makes those replays pay outside the chapter, without a new currency.
  60 stars = +6 % attack and +9 % health at most, below one gear tier (*tune* with the bot).
- Gear tiers already arrive on an act-shaped schedule; telling the player turns them into
  unlocks for free.

### Existing players (save migration)

Never take away what was earned:

- **Relics**: a relic counts as unlocked when the chapter gate is met **or** a copy of it is in the
  gear (`grantRelics` already put one there when it unlocked). No new save field. The worn-relic
  clamp in `save.ts` changes to the same rule.
- **Sutras** are derived from progress today, not stored, so moving Halo Beam from "1 Codex entry"
  to "ch 11" would take it from current players. Needs a stored bitmask (`save.sutras`), filled
  on load with what the old goals gave. `save.ts` belongs to the save-safety session: I add one
  field and its upgrade step, merged with care.
- **Monks**: owned stays owned; the gate only stops a purchase.
- Star blessings and ambience are read from stars and `cleared`, so old saves get them at once.

### What players see (to build in step 2)

- **Lobby teasers**: locked relics in the relic picker and locked monks in the monk panel stay
  visible, greyed, with "Unlocks at chapter N"; the chapter card names the next unlock ("Chapter 7:
  Prayer Beads"); the star count shows the next blessing ("20 ★: +3 % health").
- **Unlock moment on the results**: a first clear or a star total that crosses a gate shows one
  card per unlock (icon, name, one line on what it does), replacing today's plain text lines
  "New relic: …" / "New spell: …". Gear tiers get one line ("Celestial gear now drops").
  Until a chapter is cleared the card shows one at most, the relic first (`newcomerUnlocks`,
  docs/design.md "Flow").
- **Tests**: the schedule (`unlocks.ts`, pure), the migration (old saves at ch 2/3/4 keep their
  relics and sutras), the results reward, the teasers' text.

## Not proposed (needs new art or the engine)

These would make act 4 stronger, but each needs your art approval or the build-balance session
(the engine's owner):

| Idea | Needs |
|---|---|
| A fourth monk | art (rig redraw like the novice) + engine (`MONK_IDS`, passive) |
| Gating talisman / bomb / knives behind sutras | engine (`SUTRA_IDS`, engine version), and it would empty the fixed first run: **not recommended** |
| New sutra spells or passives for acts 3–4 | engine + effect art |
| Relic skins (e.g. golden ball after hard ch 5) | art; a Pixi tint on sticker art muddies the outline |
| Hero robe colours | art (palette-swapped atlas) |
| Bestiary pages in the Codex (enemies met per act) | existing mob art, client-only, but a new screen: a later step if wanted |

## Step 2 scope (after approval)

Only the parts above that need no new art: the re-paced gates, star blessings, the save migration,
lobby teasers, the results unlock moment, tests and browser screenshots in both themes. The lobby
ambience needs a look approval before it ships.
