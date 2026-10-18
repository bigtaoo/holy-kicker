import type { Engine } from '@hk/engine';
import type { PickWire } from '@hk/protocol';

// The pure side of watching a weekly's top run (ui/replayWatch.ts): where a seek goes (a tick, or
// the start of a wave), whether it lies behind the engine (a fresh one plays up to it) or ahead
// (the engine in hand steps on), the steps toward it a few hundred ticks a frame, the pick the
// timeline lights at a tick, and the timeline's grid.

/** A seek: to a tick (a pick on the timeline), or to the first tick of a wave. */
export type SeekTarget = { tick: number } | { wave: number };

/** Ticks a seek simulates per frame; about 8 ms on a phone keeps the screen responsive. */
export const SEEK_TICKS = 400;

/** Whether `e` is at `target`, or at the replay's last tick `end`, which no seek passes. */
export function reached(e: Engine, target: SeekTarget, end: number): boolean {
  const s = e.state;
  return s.tick >= end || ('tick' in target ? s.tick >= target.tick : s.wave >= target.wave);
}

/** Whether `target` lies behind `e`, so only a fresh engine from the replay's start reaches it (a wave's start once that wave began). */
export function behind(e: Engine, target: SeekTarget): boolean {
  const s = e.state;
  return 'tick' in target ? target.tick < s.tick : target.wave <= s.wave;
}

/** Steps `e` toward `target` at most `budget` ticks; whether it got there. */
export function stepToward(e: Engine, target: SeekTarget, end: number, budget = SEEK_TICKS): boolean {
  for (let i = 0; i < budget && !reached(e, target, end); i++) e.advance();
  return reached(e, target, end);
}

/** The pick the timeline lights at `tick`: the last offered at or before it, -1 before the first. */
export function pickAt(picks: readonly PickWire[], tick: number): number {
  let at = -1;
  for (let i = 0; i < picks.length && picks[i].tick <= tick; i++) at = i;
  return at;
}

/** The timeline's grid: cells `cell` wide in `cols` columns, rows `rowH` tall (the icon and its wave under it). */
export interface TimelineGrid {
  cell: number;
  cols: number;
  rowH: number;
}

/** Row height per cell width: the icon, then its wave number under it. */
const ROW_PER_CELL = 1.5;

/** The largest cells, at most `max` wide, that fit `n` picks in `width` by `height`. */
export function timelineLayout(n: number, width: number, height: number, max: number): TimelineGrid {
  for (let cell = max; cell > 24; cell -= 2) {
    const cols = Math.max(1, Math.floor(width / cell));
    if (Math.ceil(n / cols) * Math.round(cell * ROW_PER_CELL) <= height) return { cell, cols, rowH: Math.round(cell * ROW_PER_CELL) };
  }
  const cols = Math.max(1, Math.floor(width / 24));
  return { cell: 24, cols, rowH: Math.round(24 * ROW_PER_CELL) };
}
