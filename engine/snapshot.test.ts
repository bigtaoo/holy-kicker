import { describe, expect, it } from 'vitest';
import { Bot } from './bot/bot';
import { DEFAULT_RUN, type RunConfig } from './config';
import { Engine, ENGINE_VERSION } from './Engine';
import { hashState } from './hash';
import { resumeEngine, restoreState, takeSnapshot, type Snapshot } from './snapshot';

// A run left mid-fight and picked up again: through JSON and back, the restored engine must
// step on tick for tick as the one it was taken from.

const CHAPTER: RunConfig = { ...DEFAULT_RUN, seed: 77, waves: 50, threats: true };

/** Plays `ticks` with the skilled bot; `each` sees the engine after every tick. */
function play(e: Engine, bot: Bot, ticks: number, each: (t: number) => void = () => {}): void {
  for (let t = 0; t < ticks; t++) {
    e.step([bot.command(e.state)]);
    each(t);
  }
}

/** Takes a snapshot of a run at `at`, then plays the run and its restored copy side by side. */
function goesOn(config: RunConfig, at: number, after: number): void {
  const live = new Engine(config);
  const bot = new Bot(0, 'skilled', config.seed);
  play(live, bot, at);
  // a run still in the fight, with a crowd to carry over
  expect(live.state.wave, `${config.relic} wave`).toBeGreaterThan(1);
  expect(live.state.outcome).toBe('playing');
  const snap = JSON.parse(JSON.stringify(takeSnapshot(live.state))) as Snapshot;
  const back = resumeEngine(snap)!;
  expect(hashState(back.state)).toBe(hashState(live.state));
  for (let t = 0; t < after; t++) {
    const cmd = bot.command(live.state);
    live.step([cmd]);
    back.step([cmd]);
    if (t % 150 === 0) expect(hashState(back.state), `tick ${live.state.tick}`).toBe(hashState(live.state));
  }
  expect(hashState(back.state)).toBe(hashState(live.state));
  expect(back.state.gemCells.size).toBe(live.state.gemCells.size);
}

describe('snapshot', () => {
  it('goes on from a chapter run as the run would have', () => {
    goesOn(CHAPTER, 2400, 1200);
  }, 30_000);

  it('goes on with every relic and a later chapter', () => {
    for (const relic of ['staff', 'fish', 'beads', 'bowl'] as const) goesOn({ ...CHAPTER, relic, seed: 5 }, 1800, 450);
    goesOn({ ...CHAPTER, chapter: 3, hard: true, monk: 'fat', sutras: ['roar', 'focus'] }, 2400, 600);
  }, 60_000);

  it('shares nothing with the live state', () => {
    const e = new Engine(CHAPTER);
    play(e, new Bot(0, 'skilled', 1), 600);
    const snap = takeSnapshot(e.state);
    const hash = hashState(restoreState(snap)!);
    play(e, new Bot(0, 'skilled', 2), 60);
    expect(hashState(restoreState(snap)!)).toBe(hash);
  });

  it('refuses a snapshot of another engine version', () => {
    const snap = takeSnapshot(new Engine(CHAPTER).state);
    expect(restoreState({ ...snap, engine: ENGINE_VERSION - 1 })).toBeNull();
    expect(resumeEngine({ ...snap, rng: [] })).toBeNull();
  });
});
