import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, type RunConfig } from './config';
import { Engine } from './Engine';
import { hashState } from './hash';
import { LocalInputSource, quantizeMove, type PlayerCommand } from './input';
import { checkReplay, packCommands, replayEngine, takeReplay, unpackCommands, type Replay } from './replay';

// A problem report's replay: packed small, through JSON and back to the same state.

const CHAPTER: RunConfig = { ...DEFAULT_RUN, seed: 4242, waves: 50, threats: true };

/** A stick held for a second at a time, with a card picked now and then. */
function stick(tick: number): PlayerCommand {
  const k = Math.floor(tick / 30);
  const c: PlayerCommand = { owner: 0, tick, ...quantizeMove(Math.cos(k), Math.sin(k * 1.7)) };
  if (tick % 97 === 0) c.pick = tick % 3;
  return c;
}

function live(ticks: number, wave = 1): { engine: Engine; history: PlayerCommand[] } {
  const engine = new Engine(CHAPTER);
  if (wave > 1) {
    const r = replayEngine({ engine: 0, config: CHAPTER, wave, cmds: [], tick: 0, hash: 0 });
    engine.state.wave = r.state.wave;
    engine.state.waveT = r.state.waveT;
  }
  for (let t = 1; t <= ticks; t++) {
    engine.submit(stick(t));
    engine.advance();
  }
  return { engine, history: (engine.input as LocalInputSource).history };
}

describe('replay', () => {
  it('packs only the commands that change something, and unpacks them as they were', () => {
    const { history } = live(600);
    const packed = packCommands(history);
    expect(packed.length / 5).toBeLessThan(history.length / 10);
    const back = unpackCommands(packed);
    expect(back.filter((c) => c.pick !== undefined)).toEqual(history.filter((c) => c.pick !== undefined));
    expect(back[0]).toEqual(history[0]);
  });

  it('plays back through JSON to the same state', () => {
    const { engine, history } = live(900);
    const r = JSON.parse(JSON.stringify(takeReplay(engine, history))) as Replay;
    expect(r.tick).toBe(900);
    expect(checkReplay(r)).toBe(true);
    expect(checkReplay({ ...r, hash: r.hash ^ 1 })).toBe(false);
    expect(checkReplay({ ...r, engine: r.engine - 1 })).toBe(false);
  });

  it('starts a dev run on its wave', () => {
    const { engine, history } = live(300, 20);
    expect(engine.state.wave).toBe(20);
    const r = takeReplay(engine, history, 20);
    const e = replayEngine(r);
    while (e.state.tick < r.tick) e.advance();
    expect(hashState(e.state)).toBe(r.hash);
  });

  it('keeps a revive and a held stick apart from moves, per player', () => {
    const still = { moveBrad: 100, moveMag: 200 };
    const history: PlayerCommand[] = [
      { owner: 0, tick: 1, ...still },
      { owner: 1, tick: 1, ...still },
      { owner: 0, tick: 2, ...still },
      { owner: 0, tick: 3, ...still, revive: true },
      { owner: 0, tick: 4, ...still, pick: 2 },
      { owner: 1, tick: 5, moveBrad: 101, moveMag: 200 },
    ];
    const back = unpackCommands(packCommands(history));
    expect(back.map((c) => c.tick)).toEqual([1, 1, 3, 4, 5]);
    expect(back[2]).toEqual({ owner: 0, tick: 3, ...still, revive: true });
    expect(back[3]).toEqual({ owner: 0, tick: 4, ...still, pick: 2 });
    expect(back[4].owner).toBe(1);
  });

  it('leaves out commands sent ahead of the tick it was taken on', () => {
    const { engine, history } = live(120);
    history.push({ owner: 0, tick: 121, moveBrad: 7, moveMag: 255 });
    const r = takeReplay(engine, history);
    expect(Math.max(...unpackCommands(r.cmds).map((c) => c.tick))).toBeLessThanOrEqual(120);
    expect(checkReplay(r)).toBe(true);
  });

  it('ignores a torn tail', () => {
    expect(unpackCommands([1, 0, 5, 255, 0, 2, 0])).toEqual([{ owner: 0, tick: 1, moveBrad: 5, moveMag: 255 }]);
  });
});
