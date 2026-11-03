# Co-op: two players, one run

Status: **design, not started** (2026-11-03). Two friends play one chapter run together in real time, each on their own
device, joined by a room code or an invite link. There is no matchmaking, no PvP and no co-op leaderboard.
The goal is the one thing the other games of the genre on our portals lack. Nothing here is built yet.
Sections 1 to 4 are the decisions to take before any code; each one has a recommendation.

## Why it is cheap for us

The engine was built for lockstep from day one (`engine/README.md`):
- integer state;
- seeded PRNG streams;
- `InputSource.take(tick)` may return `null` to wait;
- `PlayerCommand` already carries an `owner`;
- `RunConfig.players` already spawns several heroes (`Engine.test.ts` steps two);
- most systems already loop over `s.players` or aim at `nearestPlayer`.

The network layer exists twice in our sibling projects:

| | funny (Nivara, PvP, shipped) | daydayup (Blightbloom, co-op) |
|---|---|---|
| Server | `server/gameserver`, about 1,600 lines, `ws`, relays opaque commands, never runs the sim | `server/src/MatchRoom.ts` (430), `RoomManager`, `PartyService`: funny's `Room.ts` turned into N co-op seats, socket-free and tested with a fake clock |
| Clock | Server metronome. Sim at 30 Hz, a batch of 3 frames every 100 ms. It never waits for a player. | Same (`FrameBroadcast` in the engine) |
| Client | `NetInputSource` (283), plays 3 frames behind the newest confirmed frame; catches up 3x/5x/10x when behind | `NetInputSource` (268), `CoopSession` (252), `LocalPredictor` |
| Prediction | None (a card game hides 100–200 ms) | The own hero is predicted for rendering only |
| Desync check | Once, at match end, over the result only | `checkpoint` state hash every N ticks, compared on the server |
| Reconnect | 60 s grace; `conn_resume{lastFrame}` → `conn_resync` with the frame log | The same, driven from the client (`net/reconnect.ts`) |
| Rooms | 6-digit codes in matchsvc (Redis, gateway, JWT accounts) | Numeric party codes, in memory |

**We port daydayup, not funny.**
- funny's control plane (gateway, matchsvc, Redis, metaserver) answers questions we do not have.
- Its client has no prediction, and for a moving hero that delay feels sticky.

**What we take from funny is its scar tissue** (its memory, `index/netcode.md`):
- The catch-up ladder had a gap below 1 s, so a client sat about 1 s behind for good. A wrapper input source had also dropped `confirmedLead`.
- A cold reconnect hung, and the test missed it because it mocked the rejoin.
- `/ws` stopped accepting connections for 1–2 minutes on 09-13/14. The cause was never found.

## 1. Level-up and shrine cards (decision)

**Today.** A level-up or a shrine puts three cards into `player.offer`. The whole sim stands still while any hero holds an offer (`choosing()` in `systems/build.ts`, checked in `Engine.step`), until that hero's `pick` arrives.

**With two players this breaks in two ways:**
- Each pauses the other several times a minute.
- If one player's tab is hidden or their connection drops while holding an offer, the run freezes for both.

**Options:**
- **A. Keep the stop, add a timeout.** It is hard to make deterministic, because the sim does not tick while it stands. Either the server injects a pick (but it never runs the sim, so it cannot know the offer is open) or the other client does (two clients would then both do it).
- **B. Vote, as daydayup does with `cardVote`.** That fits one shared reward. It does not fit two separate builds.
- **C. The world keeps running; the hero who picks is shielded.** ✅ *Recommended.*

**How C works, in co-op runs only (`players > 1`):**
- `choosing()` no longer stops the sim.
- A hero with an open offer stands still and cannot be hurt. This is the existing `pickGuard` idea, held for as long as the offer is open.
- The hero keeps casting spells, so the horde does not get a free lane through them.
- After `COOP.offerTimeout` ticks (`engine/config.ts`, e.g. 10 s), the engine takes `suggestCard(p)` itself. That is the bot's pick from `engine/bot`, which is engine code and deterministic. A player who walked away cannot freeze the run.
- The view keeps the card panel up but smaller, so the player can still see their friend fighting.

**Solo runs keep today's stop.** Existing replays, challenges and the golden hash don't change; the change is behind `players > 1`, but `ENGINE_VERSION` bumps anyway.

## 2. Experience (decision)

**Today.** A flying gem goes to the nearest hero and counts only for them (`dropSystem`).

**Options:**
- **Separate.** The faster player soaks the gems and the other falls behind, and the weaker friend is the one who quits.
- **Shared.** ✅ *Recommended.*

**How shared works:**
- Every gem picked up counts for every hero who is up, so both level at the same pace.
- Both get their offers at the same moment. Under decision 1 they both stand shielded for those few seconds. That reads as a shared beat, not as a pause one player forced on the other.
- The horde grows with the number of heroes (section 5), so the XP per hero stays near solo. The bots confirm this.

## 3. Scope (decision)

**First version:**
- **Chapter runs only, normal and hard.**
- **No daily or weekly challenge in co-op, and no co-op leaderboard.** Challenge records, boards and replay verification stay single-player and untouched.

**Who chooses what:**
- **The host chooses the chapter** from the chapters they have unlocked.
- Each player brings their own monk, relic, gear, training and sutras (section 5).

**Rewards:**
- Each player gets their own results and rewards, written to their own save as after a solo run. There is no server settlement, because it is a casual friends' mode.
- **A clear counts as progress for the guest only if the guest had that chapter unlocked.** Otherwise a friend could carry them past the unlock curve (`docs/unlocks.md`). The guest still gets the coins, XP and chests.

**Revives:**
- **A downed hero is revived by the teammate.** The teammate stands next to them for `COOP.reviveTicks` (e.g. 3 s, a ring fills). This is engine-side, needs no ad and no stop.
- The run is lost when both are down, as now (`waves.ts`: every hero down).
- **The rewarded-ad revive is off in co-op for the first version.** It needs the sim to stand still while an ad plays.

**Ads:** no interstitials inside a co-op session. The results screen behaves as after a solo run.

## 4. Entry and platforms (decision)

**Joining:**
- **Room code plus an invite link; no matchmaking, no friend list.**
- The host taps "Play with a friend" in the chapter screen and gets a 6-digit code and a share link (`?room=123456`).
- The guest opens the link, or types the code in the same panel.
- The room lives 10 minutes before the run starts, and 60 s after both players leave.

**Platforms:**

| Platform | Co-op | Notes |
|---|---|---|
| h.gamestao.com (web, our host) | yes | The first target. |
| Playgama | check first | Its sandbox blocks our leaderboard fetch (CSP). A WebSocket to `hk.gamestao.com` may be blocked too, so test the catalog build first. |
| CrazyGames | yes, if accepted again | Its SDK has invite and join-room hooks (look them up when we get there). |
| iOS (both apps) | yes | Room code only; Game Center invites come later. Ships by hot update once the shell is new enough. |
| GameDistribution, WeChat | no | GD builds are offline by design; WeChat is on hold. |

**Cross-play:**
- Web and iOS can play together as long as both run the same `ENGINE_VERSION` and the same theme.
- **The server refuses a join whose engine version or theme differs from the host's,** and says "your friend has a newer version". iOS hot updates lag the web by days, so this case will happen.

## 5. Engine work

**Per-hero loadout.**
- `RunConfig.relic`, `monk`, `bonus` and `sutras` are one value for every hero today.
- Move them into `heroes: HeroLoadout[]` (one per owner). A solo config keeps its current shape, so old configs, saves and replays still load.

**Single-hero leftovers.** Each of these takes `s.players[0]` or a `?? s.players[0]` fallback:

| Code | Today | Fix |
|---|---|---|
| `Engine.ts` `setup` | The sandbox horde rings hero 0. | Fine (sandbox only). |
| `waves.ts` `beginWave`, `rushBoss` | Newcomers and rush bosses spawn round hero 0. | Spawn round a living hero, alternating by a PRNG draw. |
| `drops.ts` | The nearest-hero search starts at hero 0 and counts downed heroes. | Skip downed heroes; shared XP (2). |
| `horde.ts` `nearestPlayer` | Mobs, elites and the boss chase downed heroes too. | Skip downed heroes, unless all are down. |
| Weapon systems | `find(owner) ?? players[0]` | Keep the `find`; the fallback is dead code once owners always match. |
| `bot/balance.ts` | Plays one hero. | Two-bot runs for the co-op curve. |

**View width.**
- `wide` is per run today.
- A desktop host and a phone guest see different views. Make `inView` and the spawn ring per hero (`HeroLoadout.wide`).

**Leash.**
- Two heroes walking apart split the horde, and each sees mobs spawning in plain view.
- Clamp the distance between living heroes to `COOP.leash`, about one view height. The farther hero's step is cut short at the limit.

**Scaling.**
- Horde size, elite and boss health and shrine cadence get a co-op factor, set in `engine/config.ts`.
- **Target: two `skilled` bots clear at the solo rate of one `skilled` bot,** and two `casual` bots at a little above one `casual` bot.

**Tests:**
- a two-hero golden hash per chapter;
- the determinism lint;
- a test that one hero's long offer doesn't stop the other.

**Version.** `ENGINE_VERSION` bumps. Solo hashes must not change except where intended (decision 1 is behind `players > 1`).

## 6. Server

`server/` gets a WebSocket endpoint next to its HTTP routes:
- `ws`, path `/ws`;
- Caddy on daydayup's box proxies it.

**Rooms live in memory** in the one process. There is no Redis: one box and two players per room.

**Port from daydayup:**
- `MatchRoom` (two seats), `RoomManager`, the party code, `windowClock`;
- the `FrameBroadcast` relay. It goes into the engine as `engine/net/` so the server and its tests share it.

**Drop:** settlement, integrity kicks, chapters-by-ticket.

**Protocol.** Add to `@hk/protocol`:
- `room_create`, `room_join`, `room_ready`, `match_start{config, seats}`;
- `frame_batch`, `cmd`, `checkpoint{tick, hash}`;
- `resume{lastTick}` / `resync`, `peer_dc{graceMs}`, `room_leave`.

**Checkpoint hashes:**
- Both clients send `hashState` every 150 ticks (5 s).
- On a mismatch the server ends the match for both with "connection lost" and stores both clients' replays as a problem report. The replay pipeline (`npm run replays`) can then re-simulate them side by side.

**Capacity.** The relay never runs the sim. funny's relay held 1,000 concurrent players on a 2 vCPU box, so our share of daydayup's box is no concern.

## 7. Client work

**Network (`client/src/net/`):**
- `NetInputSource`, `CoopSession`, the reconnect driver;
- `LocalPredictor`, which draws the own hero ahead of the confirmed tick; render only, never fed back.

**Hidden tabs.** A phone browser stops `requestAnimationFrame` when the tab is hidden. On return:
- the client catches up with the 3x/5x/10x ladder, and closes the gap below 1 s that funny missed;
- the other player's run does not wait (the server never waits).

**In the run:**
- the friend's hero in their own monk or corgi, with a name tag;
- their health under the own HUD;
- an off-screen arrow pointing to them;
- the revive ring;
- the shrunken card panel (decision 1);
- no pause button (a "leave" button that asks twice instead).

**Screens:**
- the "Play with a friend" panel: code, share, join, waiting;
- the version-mismatch message;
- "friend left", "friend reconnecting (60 s)", and the desync end.

Both layouts (portrait, landscape), both themes, all strings through `t()` in en and zh.

**Analytics:** `coop_room`, `coop_join`, `coop_start`, `coop_end{outcome, waves, reason}`, `coop_desync`.

## 8. Plan and size

Sizes are working days at the pace of October 2026.

| Step | Work | Days |
|---|---|---|
| 0 | Take decisions 1–4; fix the `COOP` tuning keys | 1–2 |
| 1 | Engine: loadouts, leftovers, leash, revive ring, shared XP, non-stopping offers, scaling, tests | 4–6 |
| 2 | Server: `/ws`, rooms, relay, reconnect, checkpoint compare, deploy | 3–4 |
| 3 | Client net: input source, session, predictor, catch-up, reconnect | 4–5 |
| 4 | Client UI: second hero, HUD, panels, both layouts, i18n, analytics | 5–7 |
| 5 | Balance with two bots; real-network tests (phone on 4G plus a desktop; iOS plus web) | 3–5 |
| | **Total** | **20–29** |

**Milestones:**
1. **Two tabs, one machine:** steps 1 and 2 plus a bare client, local server. This proves determinism with two heroes. About 1 week.
2. **Over the internet:** prediction, catch-up and reconnect, with a phone on 4G against a desktop.
3. **Shippable on h.gamestao.com:** UI, layouts, strings, balance. Then Playgama, after the WebSocket check; then iOS by hot update.

**Watch after launch:**
- How many runs start from a shared link.
- Whether a co-op player comes back on day 1 more often than a solo player.

If almost nobody shares the link, co-op is not the lever, and the bigger steps (matchmaking, more players) stay off the table.
