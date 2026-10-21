import { DEFAULT_RUN, Engine, checkReplay, hashState, type Replay } from '@hk/engine';
import type { ReplayEnd, ReplayWire } from '@hk/protocol';
import { describe, expect, it } from 'vitest';
import { RunReplays, type ReplaySource } from './runReplays';

// RunReplays against a fake backend: what goes out, when, and what never does.

function net(want = true) {
  const sent: { run: string; end: ReplayEnd; replay: ReplayWire }[] = [];
  let hidden = () => {};
  return {
    sent,
    hide: () => hidden(),
    replaysWanted: async () => want,
    sendReplay: async (run: string, end: ReplayEnd, replay: ReplayWire) => (sent.push({ run, end, replay }), true),
    onHidden: (cb: () => void) => void (hidden = cb),
  };
}

function source(ticks: number, waves = 50, resumed = false): ReplaySource {
  const engine = new Engine({ ...DEFAULT_RUN, seed: 9, waves });
  for (let i = 0; i < ticks; i++) {
    engine.submit({ owner: 0, tick: engine.state.tick + 1, moveBrad: (i * 300) & 65535, moveMag: 255 });
    engine.advance();
  }
  return { engine, resumed };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('run replays', () => {
  it('sends a real run whole at its end, one that plays back to the same state', async () => {
    const n = net();
    const r = new RunReplays(n);
    const src = source(300);
    r.begin(src, true);
    await r.end();
    expect(n.sent).toHaveLength(1);
    expect(n.sent[0].end).toBe('quit');
    expect(n.sent[0].replay).toMatchObject({ tick: 300, hash: hashState(src.engine.state) });
    expect(checkReplay(n.sent[0].replay as unknown as Replay)).toBe(true);
  });

  it('sends the run so far in the background, again only once it went on a while, under the same run id', async () => {
    const n = net();
    const r = new RunReplays(n);
    const src = source(60);
    r.begin(src, true);
    n.hide();
    n.hide();
    await settle();
    expect(n.sent.map((s) => s.end)).toEqual(['hidden']);
    for (let i = 0; i < 900; i++) src.engine.advance();
    n.hide();
    await r.end();
    await settle();
    expect(n.sent.map((s) => s.end)).toEqual(['hidden', 'hidden', 'quit']);
    expect(new Set(n.sent.map((s) => s.run)).size).toBe(1);
  });

  it('sends nothing the server did not ask for, nor a bent, sandbox or resumed run', async () => {
    const off = net(false);
    const r = new RunReplays(off);
    r.begin(source(30), true);
    await r.end();
    expect(off.sent).toHaveLength(0);
    const n = net();
    const r2 = new RunReplays(n);
    for (const [src, real] of [[source(30), false], [source(30, 0), true], [source(30, 50, true), true]] as const) {
      r2.begin(src, real);
      n.hide();
      await r2.end();
    }
    expect(n.sent).toHaveLength(0);
  });

  it('gives each run its own id', async () => {
    const n = net();
    const r = new RunReplays(n);
    r.begin(source(30), true);
    await r.end();
    r.begin(source(30), true);
    await r.end();
    expect(n.sent[0].run).not.toBe(n.sent[1].run);
  });
});
