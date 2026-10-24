# Experiments: A/B arms, funnel events and reading the results

Holy Kicker splits new players into arms to test a change against the current game, and reads
the arms side by side on the dashboard. Nothing runs today: `first20` ships on no host and its
`short` arm plays the same full chapter as `control` (see "A shorter first run" in
docs/retention.md for what is still to decide).

## Defining an experiment

The table is `client/src/meta/experiments.json`, one entry per experiment:

```json
"first20": {
  "note": "what it tests and what each arm does",
  "hosts": ["crazygames"],
  "arms": { "control": 1, "short": 1 }
}
```

- **id and arm names**: lower case, digits and `_`, at most 16 characters (`EXP_NAME` in
  server/src/runWire.ts). An install carries at most 4 experiments.
- **arms**: whole-number weights; `{ "control": 1, "short": 1 }` is half and half, `3`/`1` is 75/25.
  Always keep a `control` arm that plays today's game.
- **hosts**: where new players are enrolled. Roll out one host at a time: add it, ship, read it,
  then add the next. An empty list enrolls nobody.
- **Who is enrolled**: only a save that has played no run yet (`enroll` in
  client/src/meta/experiments.ts). Anyone older gets `''`, not enrolled, and stays out for good,
  even when the experiment reaches their host later. The arm is picked once by the device's own
  random, kept in the save (`arms`), carried through cloud merges (saveMerge.ts) and never
  re-rolled. On the web and iOS a save about to be enrolled is merged with the cloud save first
  (`enrollsNew`, boot.ts): the pass runs behind the art and the shell waits on it at most 4 s, so
  a player back on a new device keeps the cloud's arm (or stays out), and only a save no cloud
  answered for in time rolls on its own. Nothing waits while no experiment runs on the host.
- **Reading the arm in code**: `armOf(save, 'first20')` returns the arm, `''` when not enrolled
  or once the experiment is gone from the table. Keep arm checks in one function (like
  `runWaves`), not spread through the UI.
- **Balance numbers** an arm changes go in `client/src/meta/balance.json` like any other.
- **Dev**: `?arm=first20:short` (development builds only) forces an arm, whatever the table and the
  save say; several as `?arm=a:x,b:y`.

## What is sent

- Every event batch carries `exp`, the install's `id:arm` pairs (`first20:short`; none when the
  install is in no running experiment), and `tester: true` for an install marked as a tester. The
  server keeps both on the install (`exp`, `tester` on `Player`), like `build`. Builds that send
  neither are accepted and keep what the install had.
- Playgama: the Bridge progression events get `experiment` and `variant` fields, comma-joined
  (platform/playgama/telemetry.ts `armFields`), so Playgama's own analytics can split too.
- Collected run replays carry `exp`; `npm run replays -- --collected --exp=first20:short` reads
  one arm's runs (`--exp=first20` all arms of it).
- **Testers**: tapping the version line at the bottom of the settings 7 times marks the install
  (the line then says so). The dashboard leaves testers out unless "testers" is ticked. Mark your
  own devices before playing a build under test.

### Funnel events

- `offer` (`at`, `outcome`): a rewarded-ad offer. `shown` when its place came up with an ad ready
  (once per screen), `nofill` when no ad was ready, `taken` when the ad paid, `failed` when it was
  tapped and paid nothing. Places: `lobby_chest`, `patrol_double`, `patrol_quick`, `revive`,
  `double`, `challenge_double` (server/src/runWire.ts). Declined = shown − taken − failed.
- `ad` with `kind: 'inter'` and `at` (`results_next`, `results_lobby`, `challenge_next`): an
  interstitial that actually played. A rewarded `ad` has no `kind`.
- `run_start` / `run_end` have `waves`, the run's length. Only a won run of the full 50 waves (or
  one from an older build, which sends none) counts as a clear on the server, and only full-length
  runs go to the boards.
- Day 0 per install now also counts interstitials, offers drawn, offers with no fill and ad-free
  purchases (`iap` buy owned); the dashboard funnel has rows for each and the D1 groups split by them.

## Reading the results

`/dash` has an "Experiments" table and an "experiment" box: type `first20` for all its arms'
installs or `first20:short` for one arm, and every per-install number on the page (retention,
funnel, D1 groups, audience, first run, clears) is for those installs only. Daily actives, runs,
boards, perf and anomalies are counted by event and stay whole. The API is
`GET /v1/stats?exp=first20:short&testers=1`.

- **Primary**: D1, back on day 1, of the installs whose next day is over.
- **Secondary**: day-0 minutes on screen and the share who started a second run on day 0.
- **Guardrail**: rewarded ads and interstitials per install on day 0. A winning arm that halves
  ads is not a win without looking at revenue.
- **How many**: telling D1 25% from 30% (95% confidence, 80% power) takes about **1,250 installs
  per arm**. Below that, a gap of a few points is noise. Don't stop early because one arm looks
  ahead.
- **Per host**: pick one host on the dashboard. Hosts differ more than arms (audience, ads,
  loading), and a mix that shifts over the weeks moves both arms.
- **CrazyGames Basic Launch** shows no real ads (`basic` on the `session` event), so the ads
  guardrail means nothing there; read it on Full Launch or another host.
- New installs only: an install enrolled on day N is in the window's cohort of day N. Choose a
  window that starts on the day the experiment shipped.

## Stopping an experiment

1. **Pause**: set its `hosts` to `[]` and ship. Nobody new is enrolled; installs already in an arm
   keep it and keep being tagged, so their later days still read.
2. **Pick the winner**: make the winning arm's behaviour the game for everyone (change the code
   behind `armOf`, then remove the check).
3. **End**: delete the entry from experiments.json. Saves keep the old arm, but it is no longer
   sent (`experimentTag` only tags experiments still in the table) and `armOf` returns `''`.
   Never reuse an ended experiment's id: the server still holds its tags on the old installs.
