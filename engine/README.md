# @hk/engine: the simulation

All game logic lives here: a deterministic simulation stepped at a fixed **30 Hz**, fed only
by player commands. The client (`client/src/game`) only draws it. The split follows the
sibling project daydayup (`engine/`, `design/06-netcode-determinism.md`, `design/08-simulation-core.md`).

## Why

- **Lockstep later, for free.** Same config + same commands give the same state on every
  machine, so online play only has to exchange inputs (a frame relay server, like daydayup's
  `FrameBroadcast`), not state. Single player runs the same `Engine.step` with a
  `LocalInputSource`.
- **Replays and bug reports** are a seed, a config and a command list.
- **Runs survive a restart.** `snapshot.ts` freezes the state as plain data and restores an
  engine that steps on exactly as before, so a player who left mid-run can go on next launch.
- **Frame-rate independent.** A 120 Hz phone and a 30 fps saver mode run the same game.

## Shape

- `Engine` steps the systems in `STEP_ORDER`: input, player movement, horde, boss, kicks,
  balls, rings, beads, bowls, spells, threats, contact, drops, build, waves. The order is part of the contract.
- `RunConfig.waves` > 0 runs a chapter (`systems/waves.ts`): the horde grows each wave, elites
  and bosses arrive on their waves, the hero has health and can go down, and `state.outcome`
  turns `won` (the last boss fell, or the mid-boss of a run that ends on a mid-boss wave, like
  the daily's 20) or `lost` (every hero down). A `revive` command brings a
  downed hero back. Mobs have health that grows with the wave (`mobHp`) and come back with the
  current wave's health when they fall. `waves: 0` is the sandbox for stress tests: fixed
  horde dying in one hit, no death, no levelling.
- `RunConfig.mutator` bends one rule for a challenge run (`mutators.ts`): more elites, a faster
  horde, or a fragile hero with double XP.
- The build (`content.ts`, `systems/build.ts`): experience fills levels; each level-up deals
  three cards (relic level, a spell, a passive) into `player.offer` and the sim stands still
  until a `pick` command takes one. Passives are a modifier stack read through `stat()`.
  Shrine waves (`SHRINE`) put the three shrine cards (heal, insight, offering) into the same
  offer; `player.offerings` counts the offerings won.
- `SimState` is plain data in ordered arrays. Every moving body keeps the position it had at
  the start of the last tick (`px`, `py`), so the view interpolates between ticks.
- `PlayerCommand` is `{ owner, tick, moveBrad, moveMag, revive?, pick? }`: the stick as an integer angle
  (65536 per turn) and a 0..255 magnitude. A player who sends nothing holds the last command.
- `InputSource.take(tick)` hands the engine a tick's commands; returning `null` means "not
  known yet" (a network stall), and the engine waits.
- `SimEvent`s are the only channel to the view: kicks, hits, deaths, slams, pickups, casts,
  waves, the hero going down and coming back, the chapter cleared.

## Rules (enforced by `determinismLint.test.ts` and `Engine.test.ts`)

- **Integers only in the state.** Positions in FP (`FP = 1000` per world unit), times in
  ticks. Divide with `Math.trunc`. `hashState` throws on a non-integer.
- **No transcendental maths**: no `Math.sin/cos/atan2/hypot/sqrt/exp/pow`, no `**`. Use
  `sinB/cosB/atan2B` (table-based, `math/trig.ts`) and `isqrt`/`dist` (`math/fixed.ts`).
- **No `Math.random`, no clocks.** Randomness comes from the seeded `Prng` streams in the state
  (one per concern: `ai`, `combat`, `drop`, `spell`, `cards`).
- **No imports from outside the engine** (no Pixi, no DOM, no client code). The engine's
  tsconfig has no DOM lib.
- **Iterate arrays, not Maps or Sets**, wherever the order could affect the state.
- **Floats only at the input edge** (`quantizeMove`), which the sim never calls.
- **A rules change changes the golden hash** in `Engine.test.ts`: bump `ENGINE_VERSION` and
  record the new value on purpose.

Tuning numbers sit in `config.ts` (the build's in `content.ts`), converted once at load into FP per tick and whole ticks.

## Balance bots

`bot/` holds bots that play whole chapters through ordinary commands: `skilled` steps to the
open side at once, `casual` 0.4 s late, `still` never moves, `straight` outruns the horde in one
direction and `circle` kites it round one loop (bot/bot.ts).
`npm run balance [-- runs [style ...] [relic] [sutras | sutras=roar,focus]]` (from the repo root)
plays seeds 1..runs per style and prints, per run, the wave reached, level, health at every tenth wave, how long each elite
and boss lived and the final build. Run it after any tuning change; the targets are in
`docs/design.md` ("Difficulty").

## Not done yet

- Online: a `NetInputSource`, the relay server, checkpoint hash exchange, local prediction of
  the own hero (daydayup's `LocalPredictor`).
- The golden hash is checked in Node and Chromium (2026-10-18, Chrome 152, all nine cases of
  `Engine.test.ts` run in the page through Vite's `/@fs/` imports), and every daily challenge run is
  a cross-runtime check: the server re-simulates the device's replay in Node and files a problem
  report on a mismatch. Safari and WeChat's iOS JavaScriptCore are untested: play a daily on an
  iPhone against a dev server (`npm run dev -w client -- --host`, `?api=` the PC's LAN address with
  `npm run dev -w server`) and look for a problem report from "server re-simulation" (the server
  also logs "challenge run refused"), or paste the golden cases into Safari's Web Inspector console.
