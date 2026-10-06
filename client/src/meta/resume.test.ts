import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, Engine, hashState, quantizeMove } from '@hk/engine';
import { MemoryStore } from './saveStore';
import { dropRun, keepRun, loadRun, RUN_KEY } from './resume';

function chapterRun(ticks: number): Engine {
  const e = new Engine({ ...DEFAULT_RUN, seed: 9, waves: 50, threats: true });
  for (let t = 1; t <= ticks; t++) e.step([{ owner: 0, tick: t, ...quantizeMove(Math.cos(t / 40), Math.sin(t / 25)) }]);
  return e;
}

describe('resume', () => {
  it('keeps a chapter run across a restart, and clears it once settled', () => {
    const kv = new MemoryStore();
    expect(loadRun(kv)).toBeNull();
    const e = chapterRun(900);
    keepRun(kv, { state: e.state, freeRevives: 1, kills: 42 });
    const back = loadRun(kv)!;
    expect(hashState(back.state)).toBe(hashState(e.state));
    expect(back).toMatchObject({ freeRevives: 1, kills: 42 });
    dropRun(kv);
    expect(loadRun(kv)).toBeNull();
  });

  it('drops a broken record, another engine version and the sandbox', () => {
    const kv = new MemoryStore();
    kv.setItem(RUN_KEY, '{"snap":');
    expect(loadRun(kv)).toBeNull();
    keepRun(kv, { state: chapterRun(30).state, freeRevives: -3, kills: 1.5 });
    const stored = JSON.parse(kv.getItem(RUN_KEY)!);
    expect(loadRun(kv)).toMatchObject({ freeRevives: 0, kills: 0 });
    kv.setItem(RUN_KEY, JSON.stringify({ ...stored, snap: { ...stored.snap, engine: 1 } }));
    expect(loadRun(kv)).toBeNull();
    keepRun(kv, { state: new Engine(DEFAULT_RUN).state, freeRevives: 0, kills: 0 });
    expect(loadRun(kv)).toBeNull();
  });
});
