# Layout sweep

`npm run sweep:layout` opens the game's screens at the sizes it is played at and checks
every label on them for layout problems. It is the gate for layout work, such as the
landscape layouts: a change may fix findings but may not add one. It is not part of
`npm run check` because it needs a window and takes a few minutes.

```
npm run sweep:layout                                  every viewport
npm run sweep:layout -- --only 390x844,1100x574       just those
npm run sweep:layout -- --update                      record what it saw as the baseline
npm run sweep:layout -- --url http://localhost:5174/  a dev server already running
npm run sweep:layout -- --headless                    no window
```

Its gate in check is `client/src/ui/layoutGuard.test.ts`: the same auditor over the headless
shell at 1280x575, 1920x1080, 1024x768 and 390x844. Its text is measured by a fixed advance, so
it judges only what does not hang on a font: panels and labels off the canvas (`cutoff`,
`offscreen`), labels out of their panel or under a fill, and placeholders, on every lobby tab
and panel, the run's HUD, pause and results. It also keeps the tab bar's names at least 12 units
above the window's edge, the monk on Gear less than 15% covered, and Train's empty band above
the tab bar under 15% of the room on 16:9 (30% on 4:3).

`build/layoutSweep.mjs` starts its own Vite dev server for this checkout on a free port
from 5194 up, unless `--url` names one. It then drives the system Chrome through
playwright-core, the same way `tools/record_video.mjs` does. Chrome opens in a window of
its own because a hidden or throttled page stops drawing. Screenshots of every stop and
`report.json` go to `layout-report/`, which is not committed.

## What it visits

Each viewport gets a fresh browser context. Every page load starts from the same mid-game
save:

- chapters 1-5 cleared, every tab seen, coin to spend
- a fixed board name
- no run left to resume

The save lives in `SAVE_PATCH`.

The stops on each viewport:

| Screen | How the sweep gets there |
|---|---|
| `lobby.shop`, `lobby.gear`, `lobby.train`, `lobby.codex`, `lobby.play` | `?ads=fake&challenge`, then `openTab` and `relayout` on the lobby |
| `settings` | `openSettings` and `relayout` |
| `lobby.tasks`, `lobby.achievements`, `lobby.patrol`, `lobby.gift`, `lobby.monks`, `lobby.account`, `lobby.challenge.daily`, `lobby.challenge.weekly`, `lobby.gear.detail` | each panel opened alone by the lobby's own fields (`PANELS`), then `relayout` |
| `run.hud` | `?direct&autoplay&wave=11&seed=7&ads=fake`, so the lost run has cleared 10 waves and its gear drop is not a coin flip; the bot fights, but level-ups wait for the sweep |
| `run.cards` | the next level-up offer |
| `run.pause` | the HUD's `pauseForHost` |
| `run.down` | the hero's hp set to 0; with `ads=fake` the revive panel shows |
| `results.lost` | Escape on the death panel |
| `results.won` | a second run, set to its last wave and `won` |

The run is judged on the shell's UI layer only. The world moves, and its damage numbers
are not layout.

## Viewports

| Name | What it stands for |
|---|---|
| `360x640`, `390x844`, `430x932` | phones (touch, DPR 2-3) |
| `768x1024` | tablet |
| `1024x768` | tablet on its side (landscape, its UI over a 4:3 frame) |
| `1100x574` | CrazyGames' reviewer canvas |
| `722x406` | CrazyGames' preview tile |
| `1280x720`, `1366x768`, `1920x1080` | desktop windows (DPR 1, no touch) |
| `1920x945`, `1280x575` | short desktop windows: a browser's toolbars over a 1080p screen, a small laptop |

## Findings

`client/src/dev/layoutAudit.ts` is adapted from D:\funny's auditor. It walks the live Pixi
tree in the page and reports these findings:

- **overlap**: two labels whose ink boxes intersect, after a 10% padding trim. The overlap
  must cover at least 12% of the smaller label and 40 px². A drop shadow, which is the same
  text a few pixels off, does not count.
- **offscreen**: a label partly outside the canvas, after any mask clips it.
- **overflow**: a label running out of the solid panel or button face it sits on.
- **covered**: a label under a solid fill drawn after it.
- **tiny**: a label whose font is under **48 design units** (CLAUDE.md) after any shrink
  above it. Shrink-to-fit text counts. The line shows `font=` and `scale=`.
- **small**: a label rendered under **12 CSS px**, whatever its design size.
- **placeholder**: a label showing `undefined`, `null`, `NaN` or an unfilled `{name}`.
- **cutoff**: a solid panel or button that runs off the canvas while it holds a label, named
  by the first label on it. A short landscape window leaves a panel about 1315-1370 units of
  the 1440 it is laid out in; a panel taller than that is cut off even when each of its labels
  still shows. Such a panel goes wide instead: rows in two columns, its two halves side by side.

The walk also handles masks and backdrops:

- It honours masks.
- It drops whatever a full-screen backdrop or menu drawn later hides, so a modal is judged
  on its own.

The auditor has no imports and nests every helper, as funny's serialization rule asks. No
entry imports it: the sweep loads it into the page by its source path from the dev server,
so no release bundle carries it.

### Why 12 CSS px

The 48-unit floor is a design rule. On a small viewport it comes out smaller in CSS pixels:

| Viewport | 48 units in CSS px |
|---|---|
| 390 wide | 17 |
| 360x640 | 16 |
| 1100x574 | 19 (14 before the landscape UI's 2560x1440 floor) |
| 722x406 | 13 (10 before it) |

12 px is the size at which a short word is still readable at arm's length on a phone, or
on a laptop at desk distance. Funny's floor of 7 px only catches text that is outright
unreadable. A higher floor makes the sweep show where the viewport itself is too small for
the 3:4 column, which is what the landscape layouts are meant to fix. It is why a landscape UI
is laid out in 2560x1440 (`UI_WIDE_W`/`UI_WIDE_H` in `ui/uiLayout.ts`) rather than 1920 tall:
the screens fit that shorter frame (cards shrink their row, settings pair the volume sliders,
results set the buttons beside the card, Train puts its card beside a board grown to the tab's
height, Gear sets its totals beside the doll) and every
label comes out a third larger.

## The baseline

`build/layout-baseline.json` holds today's findings. Each one is keyed by:

- viewport
- screen
- kind
- its labels, with every word that holds a digit masked as `#`

The position is left out of the key. That way timers, balances and the build's version do
not make a finding look new.

Repeats of a key are counted. The sweep then reports:

- **NEW**, and fails, for any key over its baseline count.
- **fixed** for a baseline key it no longer sees.

After a fix, or after a change that is accepted on purpose, run `--update` and commit the
baseline. An `--only` run updates only its own viewports.

The baseline was recorded on 2026-10-26 with the 3:4 portrait column on desktop, and
re-recorded the same day for the landscape layouts on the wide viewports (581 → 571 findings),
and again when the short desktop windows and the lobby's panels joined the stops (739 findings
over the 252 screens, most of them tiny or small text on the new stops).
Any entry a change adds needs a reason in the commit.
