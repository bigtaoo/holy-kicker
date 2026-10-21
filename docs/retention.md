# Retention: reading the numbers and moving them

The dashboard is **https://hk.gamestao.com/dash** (admin key: `HK_ADMIN_KEY`, see
server/README.md). It reads `GET /v1/stats` and shows one game and one host or all of them.
Holy Kicker and its corgi reskin share the backend but never their numbers: pick the game first
(`?game=corgi`; Holy Kicker's when not given). Then pick the host you shipped to: CrazyGames, Poki
and our own web build bring different players, and our own test installs land on `web`.

Playgama's sandbox (Bridge platform `playgama_sandbox`) admits no request outside Playgama's own
hosts, so the game plays offline there and its players never reach this dashboard (no boards, no
problem reports either). Their numbers are in Playgama's telemetry only: Bridge's own session and
ad events, plus ours through `bridge.analytics.send` (`client/src/platform/playgama/telemetry.ts`):
`progression_started` / `_completed` / `_failed` per chapter and mode, the first run's tutorial
funnel (`tutorial_step` as each hint comes up, `step_id` `move` / `auto` / `gems` with `step_index`
1–3, then `tutorial_completed`, `done` and 4, each with `seconds` into the run), and a
`performance_sample` every 30 s of battle. The users per `step_id`
(`get_game_telemetry_event_analytics`, event `tutorial_step`, field `step_id`) against
`tutorial_completed` show the step first runs end on; a resumed run teaches nothing, so a player
who relaunches mid-run never completes it. They go out unless the player turned sharing off (a held
EEA answer still sends, as Bridge's own telemetry does). The catalog (platform `playgama`) still
talks to the backend as host `playgama`; whether its page lets that through is not yet known.

## What is measured

- **Install**: a random id kept in the host's storage (CrazyGames: its data module, so it follows
  a signed-in player across devices). Clearing site data or a private window makes a new install,
  so new installs run a little high and retention a little low. Portals' own consoles count the same
  players their way; compare trends, not absolute numbers. A local preview of the CrazyGames build
  (the SDK's `local` environment) reports as `web`, so the `crazygames` numbers are players only.
- **Day**: UTC calendar day of the batch's arrival. **D*N***: share of the installs first seen on a
  day that sent anything again exactly *N* days later (classic retention, not rolling). A cell
  stays empty until its day is over.
- **Window**: the last 1 to 90 days, ending today, or on an earlier day picked in the dash (`?to=`
  on `/v1/stats`). One finished day is `days=1` with that day; its installs' returns still count
  up to today, so a past day's D1 is there once the day after it is over.
- **Day 0**: everything an install did on its first day: launches, runs started and finished,
  furthest wave, the wave its first run ended on, the tutorial, lobby purchases, ads, minutes on
  screen (`leave` events), and where it was when it last left (lobby, results, or mid-run and on
  which wave; a run whose page died with no `leave` counts as left mid-run at its last `alive`,
  the beat each minute of play sends). Ads are the ones watched: a reward paid with no ad (iOS's ad-free card, every
  rewarded offer while CrazyGames keeps the game in Basic Launch) is tracked as `free` and left
  out, so "watched an ad" stays "no" on CrazyGames until Full Launch.
- **Boards**: every finished run in the window by chapter and mode, with the wave each lost one
  ended on (died or gave up there); the boss waves (20, 35, 50) are marked.
- **Daily challenge** (from the challenge build, not on the dash yet): a challenge run's
  `run_start` and `run_end` carry `challenge` (the day's id, `d20261019`); the dash does
  not tell them apart yet, so they also count as runs on their chapter's board. The challenge boards
  themselves (`/v1/challenge/boards/…`, server/README.md) show how many played each day; how many
  of a day's active installs open the daily is the lever to watch once it ships.
- **First clears**: of the window's new installs, how many tried each board and cleared it, and
  the median days since their first day and runs it took. Only runs from 2026-10-07 on are
  counted, and installs still stuck are left out of the medians.
- **Build**: the version and commit (`0.0.1+61b33eb`), kept per install as the first build it
  played. "first build played" is the before/after comparison for a change.
- **Who**: device (desktop, mobile, tablet), browser, system and country, kept once per install
  from its first batch (installs before 2026-10-10 are `unknown`). The device is the game's own
  call (the CrazyGames SDK knows tablets; iPadOS Safari passes for a Mac otherwise), browser and
  system come from the user agent, the country from Cloudflare by address (never kept; checked
  live on 2026-10-10). CrazyGames builds uploaded before that day do not send the device, so
  their iPads count as desktop (macOS, Safari) until the next upload. "Who the
  new players are" shows each group's size, how many finished a run on day 0 and its D1: a device
  or browser far below the rest is a bug or a performance problem there before it is a design one.
- **Loading** (from 2026-10-14's CrazyGames build): two anonymous counts per launch, no id and
  whatever the privacy answer. `open` is sent by an inline script in the portal page before the SDK
  and the game's code load; `loaded` once the first screen is up. Both split into touch and desktop
  (`pointer: coarse`). Opened but never loaded is a launch lost to download size, a crash or a
  closed tab before the game showed anything, which no event can see. The `session` event also
  carries the CrazyGames SDK's environment and start (`sdk`: `crazygames/ok`, `/timeout`,
  `/noscript`), its start time in ms (`sdkMs`) and whether the game is in Basic Launch (`basic`).

Below ~100 new installs a day, any share swings by several points from noise alone. Pool a week
before believing a change, and never read a single day.

## The loop

1. **Find the drop.** The funnel says where new players stop on day 0; "Where the first run ended"
   shows walls; "last left the game from" says what they were looking at when they quit for good.
2. **Find the aha.** In "Who comes back the next day", look for the day-0 behaviour with the
   biggest gap in D1 (e.g. 4–6 runs finished: 40%, one run: 16%). That behaviour is the target:
   get more new players to it, sooner. Correlation is not cause (keen players both play more and
   come back), but it says where to push.
   **Watch the runs behind it.** Until 2026-12-31 every real run's replay is collected (kept 15
   days; `COLLECT` in `server/src/replayShelf.ts` is the switch): `npm run replays --
   --collected=200` says per run what hurt the hero, where they died, how they played the stick
   and which cards they took, so a wall in the funnel comes with the runs that hit it.
3. **Change one thing** per release, and note the commit.
4. **Compare builds.** "first build played" splits D1 by the release new players started on. Wait
   for a few hundred installs on the new build before calling it.

## Checking a new upload

The dashboard needs days; a broken upload should show within hours. `tools/launch_check.mjs`
compares a host's newest build with the one before it, each over the same age (the hours the
newest has been up), split desktop / touch; `--game corgi` looks at the corgi's (both games' builds
of one commit share its name):

```bash
node tools/launch_check.mjs --host crazygames --since 2026-10-14
```

`--builds 3997841,baee706` picks the builds (any part of the name; default: the two newest that
sent a `session` since `--since`), `--all` drops the same-age window, `--save f.json` /
`--load f.json` keep or reuse the raw pull. It reads production MongoDB through the hk-api
container (`ssh blightbloom`, read only) and prints, per build and device: new installs and
launches; load beacons with their median bucket; first runs on screen 60 s or more (a proxy for
CrazyGames' conversion; desktop needs ~63%), the median day-0 time on screen, first runs left at
the tutorial's `move` step (with 0 kills or some, and on new builds whether the game ever had
the keys or saw input), replay after the first death, a second run, reaching the lobby; runs
that stopped with no `leave` or `run_end` (the page died) with the wave the last `alive` saw;
`run_resume`; stalls, `perf` trouble snapshots and problem reports. A "–" means the build does not
send that event. With tens of installs per build a few players move any share by 5–10 points:
look for a step change, a share halving or a count going from 0 to many, not for small drifts.

## Symptoms and levers

| What the dashboard shows | Likely cause | Levers in this game |
|---|---|---|
| opened → started a run under ~85% | Load time, a blank or broken first screen on some devices, a first screen that does not say "play" | Problem reports by device; smaller first download; the first run starts straight away for new players (it does: `firstRunDone`) |
| started → finished the tutorial low | Hints that block or confuse | Fewer, shorter hints (`ui/tutorial.ts`); hints shown only when the action is needed |
| first runs pile up on one wave | A difficulty wall | That wave's spawns, the first elite (wave 5) and the first boss; the hero's first level-ups; `balance.json` |
| left mid-run, early waves, and not back | Boredom or frustration before the build comes together | A strong card in the first two level-ups; faster early waves (the 2x toggle helps players who know it is there) |
| one run finished on day 0, D1 low | Nothing pulled them into a second run | A result screen that shows progress (new card unlocked, training now affordable, "next time: wave 20"), a short and obvious "again" button |
| D1 fine, D3/D7 drops below ~30% of D1 | Nothing to come back for | Daily tasks and their rewards, patrols that finish overnight, chapter unlocks spaced over days, a training goal just out of reach |
| a boss wave spikes in a board's lost runs | That boss is a wall | Its health, or grit (`BALANCE.grit`) for the players stuck there; docs/design.md "Pacing targets" |
| first clears of chapters 4–5 take far longer than the 2 / 3–4 weeks the design aims for | The last chapters are too hard for the gear players have by then | `HORDE.chapterHp`, `HURT.chapterPercent`, grit; compare with the bots' numbers in docs/design.md |
| chapter 1 clear rate very low | The first win comes too late | Ease chapter 1's last waves, or make the first clear reachable within the first 3–4 runs with training |
| bought in the lobby: big D1 gap | Meta progress is the hook | Make the first purchase happen on day 0 (start with enough copper for one training node) |

## First run: where players leave (2026-10-19)

Backend events of the 262 CrazyGames installs first seen 10-14..10-17 (builds 6a16373 to baee706,
ordered by the device's `t`), Newgrounds build 81b1aee (10-18) and Playgama build 012848d (10-18):

- **Loading** (desktop): 239 page opens, 199 first screens (17% of desktop visits lost, 15 of them
  quit within 1–3 s); touch 145 → 142. 32b530e (WebP art, languages on demand) trims the first load.
- **In the run**: every install started one; 73% stayed 60 s or more (desktop 70%, mobile 81%,
  tablet 63%), 84% finished the tutorial (median 22 s on desktop, 17 s on phones). Of the 72 first
  runs under 60 s, **30 left with a level-up card open, at levels 2–6** (desktop 17 of 47, mobile
  11 of 14): 11.5% of installs, the biggest single drop. Next: 15 at the `move` hint with no card
  (10 of them desktop, gone within 5 s), 12 whose page died with no `leave` (8 after the tutorial), ~6 after the
  tutorial at level 5 (40–49 s).
- **Fix**: cb3217d (a level-up before the player moved takes its card) and c40c5b8 (the first run's
  5 opening cards take themselves, seed 92). On Newgrounds 81b1aee, which has both, none of the 11
  desktop first runs under 60 s ended at a card (17 of 47 on CrazyGames before). Expected on
  CrazyGames: if half of those 30 stay past a minute, first runs of 60 s or more go 73% → ~78%,
  desktop 70% → ~75%, and with 83% of desktop visits loading, desktop conversion reaches about the
  63% Basic Launch bar. The first card the player picks now comes at level 7, about a minute in;
  cards left open at levels 7–9 (61–100 s) were 9 of the 25 first runs left between 60 and 120 s.
- **Next drop**: the `move` hint on desktop. 10 of 15 Newgrounds desktop first runs ended there,
  7 with the page focused but no key or click ever, 6 within 6 s: players who looked and left, not
  players who could not steer. CrazyGames builds from e5c62db say the same with `focus` / `input`.
- **Playgama** (ad traffic, 012848d with the fix): 326 started a run, 44% finished the tutorial,
  39% passed 60 s; Bridge's session facts are too coarse to name the step, so builds from this
  commit send `tutorial_step`. Read it before changing the hints.

## Performance

A device that stutters loses players before any design lever matters, so the dash also shows how
battles run (builds from 2026-10-15 on; contract in `server/src/protocol.ts` `PerfProps`,
`SessionDeviceProps` and `AnomalyProps`, numbers in `server/src/perf.ts`, findings in
`server/src/diagnose.ts`).

- **`perf`** is a frame-rate snapshot over battle frames only (lobby, pauses and card choices left
  out): seconds measured, median and 5th-percentile fps (`p5`), frames of 50 ms or longer, the
  quality level the run started on, the lowest it fell to and the current one, the most mobs
  alive, which run of the launch it is (`nth`), and what the game holds: GPU textures (`tex`,
  `texMB`), display objects on stage (`nodes`) and, on Chrome, the JS heap, each with its change
  since the run's first battle frame (`...Up`). One is sent per run, when it ends (`why: end`) or
  when the game goes to the background mid-run (`leave`); a `mid` snapshot every 3 battle minutes
  is sent only while something looks wrong (`perfTrouble`: a slow p5, many long frames or memory
  climbing), and a healthy stretch is folded into the next snapshot instead. So the table rows
  are mostly one snapshot per run, and the `mid` column counts trouble.
- The **device** (memory, cores, a coarse GPU class) comes once per launch on the `session` event,
  not on every snapshot; the server joins it to the snapshots by session id.
- **`anomaly`** is one thing gone wrong, sent as it happens, at most 3 of each kind per session:
  `webgl_lost` (the GPU context dropped: the game goes black), `error` (an uncaught error, with
  its message and the file:line:col it was thrown at), `memory` (the host's memory warning; WeChat
  on Android gives level 5, 10 or 15) and `stall` (one frame of a second or more; a hidden tab's
  gap does not count). `memory` and `webgl_lost` carry what the game held at that moment.

**Read the Diagnosis first.** It sits near the top of the dash and lists what the rules found,
problems (fix) before warnings (watch), each with where (a build, a device class, a device + GPU,
an error's source), the numbers and where in the client to look. Every rule waits for enough
runs (usually 5 per group, 10 per build for a regression), so one odd device does not alarm.
The rules and their thresholds are constants at the top of `diagnose.ts`:

- **leak_in_run**: in a build's runs of 2+ battle minutes, the heap grows 3+ MB per battle minute
  or textures grow by 10+. The hint names the suspect: textures climbing (never destroyed), else
  display objects well past what the horde explains (sprites never removed), else plain JS
  objects (take a heap snapshot).
- **leak_across_runs**: the third and later runs of a launch start holding more than the first
  (heap +30 MB, textures +20 or display objects +500): something survives the run teardown.
- **heap_high**: snapshots holding 800+ MB of heap or 400+ MB of textures, per device class.
- **memory_warning** and **webgl_lost**: 3+ in a build. WeChat kills the game soon after a
  level 15 warning; both point at texture memory first.
- **stalls**: 6+ frames of a second or more per battle hour of a build.
- **errors**: the same message from the same place 2+ times (5+ is a problem).
- **slow_device**: a device + GPU whose median p5 is under 30, with how many runs fell below the
  phone quality level. Under `saver` are `slow` (battles capped at an even 30) and `crawl` (30
  and 0.75 resolution): a `lvMin` of either means the device could not hold saver, and the run
  kept going on less (`client/src/game/quality.ts`).
- **fps_regression**: on a device class, the newest build's median p5 is 5+ fps below the build
  before it.

Under it, the Performance tables split snapshots by the install's device and system and by build
(newest first, so a regression shows right after a deploy), then list the 10 worst snapshots of
at least 30 battle seconds with their device details. Worrying numbers:

- **p5 under 30 on phones** (red in the tables): fights stutter whenever the horde is big. Under 45
  is amber. Look at the worst list for the GPU class, memory and mob count they share.
- **long/min** above a few, or many `stall` anomalies: hitches big enough to feel (loading art
  mid-battle, garbage collection, shader compiles).
- **hitches/min** (pacing columns, the `hitches` rule): frames that missed a refresh of the
  display the game runs at (`hz`). A long frame is judged with the one after it, so iOS's late
  then early callbacks, which add up to whole refreshes, are not counted. Builds before 5d8db2f
  over-counted them hugely on iOS (a smooth run read 230–440/min with `hz` 63–115 on a 60 Hz
  phone); for those, read long/min and p5 instead.
- **below phone** high on a device class: the automatic quality drop is doing a lot of work
  there; the effects budget on that class may be too high.
- **texture MB** and **nodes** climbing between builds, any `webgl_lost`, memory warnings and a
  rising heap: the game runs out of memory on those devices, and the next step after a warning
  is often the host killing it.
- **errors**: the top messages are bugs to fix; a new message right after a deploy is that build.
  The anomalies' by-build table shows which build brought it.

A run that crashes or is killed never sends its `end` snapshot. If `leave` snapshots outnumber
`end` on a device class far more than elsewhere, runs there are dying silently; compare with the
anomalies on the same days.

**Retention of the raw data.** `perf` and `anomaly` events are kept 28 days (`PERF_KEEP_DAYS`),
then deleted by a weekly prune (`Store.prune`, run by the server and remembered in the
database's `meta` collection, so restarts on deploy do not reset it); every other event keeps the
90-day TTL. A dash window longer than 28 days shows perf numbers for the last 28 only.

## Rough bars for a casual web game

D1 30%+ good, 20–30% average, under 20% weak; D7 10%+ good, 5–10% average. Portal consoles
(CrazyGames, Poki) show their own medians for comparison; trust those over these.
