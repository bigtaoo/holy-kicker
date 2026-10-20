import { PERF_MID_SECS, type PropValue } from '@hk/protocol';
import { describe, expect, it } from 'vitest';
import type { MemSample } from '../game/memProbe';
import type { Backend } from './backend';
import { CTX_BOSS, CTX_WAVE } from '../game/perfMeter';
import { hitchContext, PerfReport } from './perfReport';

function setup() {
  const sent: Record<string, PropValue>[] = [];
  let hidden = () => {};
  const net = { track: (_e: string, p: Record<string, PropValue>) => sent.push(p), onHidden: (cb: () => void) => (hidden = cb) } as unknown as Backend;
  const mem: MemSample = { tex: 100, texMB: 50, nodes: 2000 };
  const report = new PerfReport(net, () => ({ ...mem }));
  return { sent, mem, report, hide: () => hidden() };
}

const battle = (r: PerfReport, secs: number, ms = 1000 / 60) => {
  const f = { ms, target: 1000 / 60, vsync: 1000 / 60, level: 4, work: 4, sim: 1, view: 1, draw: 2 };
  for (let i = 0; i < (secs * 1000) / ms + 1; i++) r.frame(f, 10);
};

describe('PerfReport', () => {
  it('sends one snapshot at the end of a run with what memory grew since its first battle frame', () => {
    const { sent, mem, report } = setup();
    report.start(true);
    battle(report, 3);
    mem.tex = 112;
    mem.nodes = 2500;
    battle(report, 3);
    report.end();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ why: 'end', nth: 1, tex: 112, texUp: 12, nodes: 2500, nodesUp: 500 });
    expect(sent[0]).not.toHaveProperty('heap');
  });

  it('folds a healthy mid stretch into the next snapshot and sends a troubled one', () => {
    const { sent, mem, report } = setup();
    report.start(true);
    battle(report, PERF_MID_SECS);
    expect(sent).toHaveLength(0);
    mem.tex += 40;
    battle(report, PERF_MID_SECS);
    expect(sent).toMatchObject([{ why: 'mid', texUp: 40 }]);
    expect(sent[0].secs).toBe(2 * PERF_MID_SECS);
  });

  it('sends a mid stretch whose frames often miss a refresh', () => {
    const { sent, report } = setup();
    report.start(true);
    const late = { ms: 2000 / 60, target: 1000 / 60, vsync: 1000 / 60, level: 4, work: 3, sim: 1, view: 1, draw: 1 };
    // 13 hitches a minute, just over PERF_TROUBLE
    for (let i = 0; i < 13 * (PERF_MID_SECS / 60); i++) report.frame(late, 10);
    battle(report, PERF_MID_SECS);
    expect(sent).toMatchObject([{ why: 'mid', hitch: 13 * (PERF_MID_SECS / 60), hitchWork: 0, hz: 60 }]);
  });

  it('notes a boss or elite up and the first seconds of a wave', () => {
    const s = { boss: null, elites: [], wave: 3, waveT: 0 } as unknown as Parameters<typeof hitchContext>[0];
    expect(hitchContext(s)).toBe(CTX_WAVE);
    expect(hitchContext({ ...s, waveT: 1000 })).toBe(0);
    expect(hitchContext({ ...s, wave: 0 })).toBe(0);
    expect(hitchContext({ ...s, waveT: 1000, elites: [{}] } as typeof s)).toBe(CTX_BOSS);
  });

  it('counts runs since launch, sends nothing for an unmeasured run, and snapshots on hide', () => {
    const { sent, report, hide } = setup();
    report.start(false);
    battle(report, 10);
    report.end();
    expect(sent).toHaveLength(0);
    report.start(true);
    battle(report, 10);
    hide();
    expect(sent).toMatchObject([{ why: 'leave', nth: 2 }]);
  });
});
