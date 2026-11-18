# Holy Kick: prototype plan

Status: prototype built (2026-11-18), dev only: `?kick` (with `?arena` for the walled arena) turns it
on; no release reads the switch, and runs without it hash and replay as before (`ENGINE_VERSION`
unchanged). Not yet played by hand (step 3). The goal is one move no other horde survivor has,
which the player triggers and gets better at, and which the cover and the video can show.

## The feel we want

The monk winds up and kicks one enemy so hard that it flies off as a projectile, bowling through
the crowd behind it. Every enemy it hits takes damage; one that falls flies on in turn, so a
well-placed kick chains through a column of the horde. In the arena a body that meets a wall bursts
against it and hurts everything close. The skill is positioning: stand so the crowd lies behind the
target, then kick.

Three tests decide whether it stays (play ten arena runs each, then the bot numbers below):

1. It is the thing you want to press, not a chore: kicks are used when ready, not forgotten.
2. A good kick reads at a glance: a line of bodies flying, a burst on the wall, a number that grows.
3. It does not replace the build: spells still carry the run, the kick is the moment of play.

## Input

- **Desktop:** Space or a left click. Hover steering (`hoverSteer.ts`) uses only the pointer's
  position, so a click is free.
- **Touch:** a quick tap anywhere (down and up within about 180 ms, moved less than the stick's dead
  zone). Dragging is still the stick, so one thumb plays both. No on-screen button in the prototype.
- **Engine:** `PlayerCommand.kick?: boolean`, a one-shot like `revive` and `pick` (`engine/input.ts`).
  It is ignored while the kick is not ready. Replays and lockstep carry it unchanged.

## Readiness

- A meter of **kick charge** fills with kills (say 1 per kill, full at 25). When it is full the kick
  is ready, with a glow on the monk and a ring on the HUD. A cooldown would ask for nothing; kills
  reward playing aggressively.
- One charge in the prototype. Stacking up to 2 or 3 is a later knob, and a card could raise it.

## Simulation (engine)

- **Target:** the nearest living mob in the hero's facing half within `KICK.reach`, else the nearest
  in any direction. It flies straight away from the hero, so the hero aims by where they stand.
- **Flyers:** a new ordered list `s.flyers` (`Flyer extends Body`: kind, vx, vy, travel, hits,
  depth). The kicked mob is downed the usual way (`downMob`, so it drops its gem and respawns into
  the horde: the mob count and the wave's kill count are unchanged). A flyer is spawned at its spot
  with its look (`kind`) for the view.
- **Flight:** each tick a flyer moves `KICK.speed` and looks up mobs within `KICK.radius` in the
  spatial grid (`grid.ts`, as the ball does). Each mob hit takes `KICK.damage` percent of the hero's
  attack (`damage()` in `combat.ts`, knocked aside, not along). A mob that falls becomes a flyer
  too, `depth + 1`, flying along the same line spread by up to ±15°. Depth stops at `KICK.chain`, so
  a chain is bounded. An elite or boss hit stops the flyer and takes `KICK.bigDamage` plus a stun.
- **End:** after `KICK.range` of travel the flyer drops. In the arena, at the wall (`arena.ts`
  `keepIn` limits), it bursts: `KICK.slamDamage` to every mob within `KICK.slamRadius`.
- **Events:** `kickCharged`, `holyKick` (owner, target, dir), `flyerHit`, `flyerSlam`, and the chain
  length when it ends, for a "×7" callout and for the run_end telemetry.
- **Numbers** in `config.ts` as `KICK`, integers and FP like the rest. `ENGINE_VERSION` +1. The
  snapshot and hash take `flyers` and the charge. The prototype runs only where `RunConfig.kick` is
  on: the arena and `?kick` in chapters. Chapter replays and boards are untouched until it is kept.

## View (client)

- The monk's kick pose (hero_tao.json "kick"), held a beat longer with a hit-stop of about 60 ms
  on contact. A flyer is the mob's own frame spinning with a short smear and an ink trail. Each hit
  flashes white, and the screen shakes a little on a wall slam.
- A chain counter over the hero (×2, ×3 …) in the display font. The scale follows `effectHeat`, as
  the damage numbers do, so late waves keep only the big ones.
- Sound: one heavy kick cue, a rising pitch per chain step, one slam.
- Both layouts: the charge ring sits on the HUD's level bar in portrait and beside the portrait in
  landscape.

## Bot and balance

- The bot (`engine/bot/bot.ts`) kicks when charged, if at least N mobs lie within a 20° cone
  behind the target, or at once with a flag. It reports kicks, chain lengths and the damage share.
- Arena: compare the average waves reached and the time survived with and without the kick (bot,
  200 runs each). Pick `KICK.damage` and the charge so the kick is 10–20 % of the damage dealt and
  the waves reached move by less than a wave. The kick has to feel strong, not carry the run.
- If it is kept for chapters, run the same check on chapters 1, 3 and 5 against the current curve
  (docs/design.md "Pacing targets").

## Steps

1. Engine: `KICK`, `kick` input, charge, flyers, chain, wall slam, events, plus tests (determinism,
   bounded chain, arena slam, a replay that round-trips). About a day.
2. View and input: tap/Space, flyers, hit-stop, counter, ring, sound. About a day.
3. Play it yourself in the arena (`?arena`). Tune by feel, then the bot numbers.
4. Decide: keep it (chapters too, a card or two that build on it, the cover and video redone around
   it), rework it, or drop it. Dropping it costs nothing outside the arena.

## As built

- Engine: `engine/kick.ts` (`KICK`, `Flyer`, the charge), `engine/systems/holyKick.ts` (kick, flight,
  chain, burst), events `kickReady`, `holyKick`, `kickChain`, `kickBurst`, `kickEnd`. The chain is
  bounded by `KICK.bodies` (bodies from one kick) and `KICK.pierce` (mobs one body flies through);
  an elite or the boss stops a body and makes it burst. `Player.kickDealt` tallies the kick's damage.
- Input: Space (`platform.onKey`) and a tap of under `TAP_MS` that never leaves the stick's dead zone
  (`dragStick.ts`). A left click is not wired yet; a tap on a HUD button may also kick.
- View (`client/src/game/kickView.ts`): the charge ring sits at the hero's feet in the world, not on
  the HUD, so both layouts get it for free; the chain counter reuses `gear.count` ("×{n}"); 60 ms
  hit-stop, shake, rings. Sounds reuse cues: bell when ready, slam on the kick, thump per chain step,
  boom on a burst.
- Bot (`engine/bot/kickAim.ts`): `bot.kick` = `aim` (kicks when a line of the horde lies behind the
  target), `now` or `never`; `?autoplay` kicks too.

### Bot numbers (arena, skilled bot, no gear, 16 seeds)

| | waves | seconds | kick share | kicks | chain |
| --- | --- | --- | --- | --- | --- |
| no kick | 68.1 | 1031 | – | – | – |
| first cut (full 25, damage 450, burst 500) | ~72 | ~1090 | 30 % | 311 | 6.7 |
| kick with damage near 0 | 67.1 | 1017 | 0.5 % | 331 | 2.7 |
| **chosen** (full 40, damage 300, burst 300) | 74.4 | 1123 | 14 % | 252 | 5.9 |

The kick itself (the kicked mob's gem, the space it clears) gains nothing; the gain is its damage.
In the endless arena any share that feels strong (10–20 %) also adds about 6 waves (+9 %), so the
"less than a wave" target cannot hold together with it. If the kick is kept, the arena's curve (or
the spells) gives those waves back, rather than the kick going weak.

## Open questions

- Should the kick also cancel the auto-kick's cooldown, or stay separate? Separate is easier to read.
- The fat monk and the novice: the same kick with a different look, or one each (a belly bump that
  rolls, a staff sweep that bats)? Start with one kick for all.
- Corgi theme: the same mechanic as a tackle. The look decides.
