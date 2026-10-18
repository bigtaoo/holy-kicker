import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, Engine, hashState, quantizeMove, replayEngine, takeReplay, type LocalInputSource, type PlayerCommand } from '@hk/engine';
import { behind, pickAt, reached, stepToward, timelineLayout } from './replaySeek';

const CONFIG = { ...DEFAULT_RUN, seed: 4242, waves: 50, threats: true };

/** A recorded run: a stick turning each second, a card picked now and then. */
function recorded(ticks: number) {
  const engine = new Engine(CONFIG);
  for (let t = 1; t <= ticks; t++) {
    const k = Math.floor(t / 30);
    const c: PlayerCommand = { owner: 0, tick: t, ...quantizeMove(Math.cos(k), Math.sin(k * 1.7)) };
    if (t % 97 === 0) c.pick = t % 3;
    engine.submit(c);
    engine.advance();
  }
  return takeReplay(engine, (engine.input as LocalInputSource).history);
}

describe('seeking a replay', () => {
  const replay = recorded(1500);

  it('steps a few hundred ticks a frame to the tick asked for, never past the end', () => {
    const e = replayEngine(replay);
    expect(stepToward(e, { tick: 1000 }, replay.tick, 400)).toBe(false);
    expect(e.state.tick).toBe(400);
    while (!stepToward(e, { tick: 1000 }, replay.tick, 400));
    expect(e.state.tick).toBe(1000);
    expect(reached(e, { tick: 900 }, replay.tick)).toBe(true);
    while (!stepToward(e, { tick: 99_999 }, replay.tick, 400));
    expect(e.state.tick).toBe(replay.tick);
    expect(hashState(e.state)).toBe(replay.hash);
  });

  it('goes to the first tick of a wave, a fresh engine for one behind', () => {
    const e = replayEngine(replay);
    while (!stepToward(e, { wave: 2 }, replay.tick));
    expect(e.state.wave).toBe(2);
    const start = e.state.tick;
    e.advance();
    expect(behind(e, { wave: 2 })).toBe(true);
    expect(behind(e, { wave: 3 })).toBe(false);
    expect(behind(e, { tick: start })).toBe(true);
    expect(behind(e, { tick: start + 5 })).toBe(false);
  });

  it('lights the last pick offered at or before the tick', () => {
    const picks = [100, 400, 900].map((tick, i) => ({ tick, wave: i + 1, offered: ['spell:bolt'], took: 0 }));
    expect(pickAt(picks, 50)).toBe(-1);
    expect(pickAt(picks, 100)).toBe(0);
    expect(pickAt(picks, 899)).toBe(1);
    expect(pickAt(picks, 5000)).toBe(2);
  });

  it('fits the timeline in its box, as large as it may be', () => {
    expect(timelineLayout(10, 900, 300, 90)).toEqual({ cell: 90, cols: 10, rowH: 135 });
    const g = timelineLayout(60, 900, 300, 90);
    expect(Math.ceil(60 / g.cols) * g.rowH).toBeLessThanOrEqual(300);
    expect(g.cell).toBeLessThan(90);
  });
});
