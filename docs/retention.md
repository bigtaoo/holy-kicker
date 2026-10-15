# Retention: reading the numbers and moving them

The dashboard is **https://hk.gamestao.com/dash** (admin key: `HK_ADMIN_KEY`, see
server/README.md). It reads `GET /v1/stats` and shows one host or all of them. Pick the host
you shipped to: CrazyGames, Poki and our own web build bring different players, and our own test
installs land on `web`.

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
  which wave). Ads are the ones watched: a reward paid with no ad (iOS's ad-free card, every
  rewarded offer while CrazyGames keeps the game in Basic Launch) is tracked as `free` and left
  out, so "watched an ad" stays "no" on CrazyGames until Full Launch.
- **Boards**: every finished run in the window by chapter and mode, with the wave each lost one
  ended on (died or gave up there); the boss waves (20, 35, 50) are marked.
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
3. **Change one thing** per release, and note the commit.
4. **Compare builds.** "first build played" splits D1 by the release new players started on. Wait
   for a few hundred installs on the new build before calling it.

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
  phone quality level.
- **fps_regression**: on a device class, the newest build's median p5 is 5+ fps below the build
  before it.

Under it, the Performance tables split snapshots by the install's device and system and by build
(newest first, so a regression shows right after a deploy), then list the 10 worst snapshots of
at least 30 battle seconds with their device details. Worrying numbers:

- **p5 under 30 on phones** (red in the tables): fights stutter whenever the horde is big. Under 45
  is amber. Look at the worst list for the GPU class, memory and mob count they share.
- **long/min** above a few, or many `stall` anomalies: hitches big enough to feel (loading art
  mid-battle, garbage collection, shader compiles).
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
