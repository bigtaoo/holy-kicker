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

## Rough bars for a casual web game

D1 30%+ good, 20–30% average, under 20% weak; D7 10%+ good, 5–10% average. Portal consoles
(CrazyGames, Poki) show their own medians for comparison; trust those over these.
