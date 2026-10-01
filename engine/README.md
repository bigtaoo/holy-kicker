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
- **Frame-rate independent.** A 120 Hz phone and a 30 fps saver mode run the same game.

## Shape

- `Engine` steps the systems in `STEP_ORDER`: input, player movement, horde, boss, kicks,
  balls, spells, threats, contact, drops. The order is part of the contract.
- `SimState` is plain data in ordered arrays. Every moving body keeps the position it had at
  the start of the last tick (`px`, `py`), so the view interpolates between ticks.
- `PlayerCommand` is `{ owner, tick, moveBrad, moveMag }`: the stick as an integer angle
  (65536 per turn) and a 0..255 magnitude. A player who sends nothing holds the last command.
- `InputSource.take(tick)` hands the engine a tick's commands; returning `null` means "not
  known yet" (a network stall), and the engine waits.
- `SimEvent`s are the only channel to the view: kicks, hits, deaths, slams, pickups, casts.

## Rules (enforced by `determinismLint.test.ts` and `Engine.test.ts`)

- **Integers only in the state.** Positions in FP (`FP = 100` per world unit), times in
  ticks. Divide with `Math.trunc`. `hashState` throws on a non-integer.
- **No transcendental maths**: no `Math.sin/cos/atan2/hypot/sqrt/exp/pow`, no `**`. Use
  `sinB/cosB/atan2B` (table-based, `math/trig.ts`) and `isqrt`/`dist` (`math/fixed.ts`).
- **No `Math.random`, no clocks.** Randomness comes from the seeded `Prng` streams in the state
  (one per concern: `ai`, `combat`, `drop`, `spell`).
- **No imports from outside the engine** (no Pixi, no DOM, no client code). The engine's
  tsconfig has no DOM lib.
- **Iterate arrays, not Maps or Sets**, wherever the order could affect the state.
- **Floats only at the input edge** (`quantizeMove`), which the sim never calls.
- **A rules change changes the golden hash** in `Engine.test.ts`: bump `ENGINE_VERSION` and
  record the new value on purpose.

Tuning numbers sit in `config.ts`, converted once at load into FP per tick and whole ticks.

## Not done yet

- Online: a `NetInputSource`, the relay server, checkpoint hash exchange, local prediction of
  the own hero (daydayup's `LocalPredictor`).
- The golden hash is checked in Node and Chromium; WeChat's iOS JavaScriptCore is untested.
