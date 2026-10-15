import { describe, expect, it } from 'vitest';
import { diagnose } from './diagnose';
import { anomalyKey, type AnomalyCount, type PerfSnap } from './perf';
import type { PropValue } from './protocol';

const snap = (over: Partial<PerfSnap>, p: Record<string, PropValue> = {}): PerfSnap => ({
  day: '2026-10-01', host: 'web', build: '5', device: 'mobile', os: 'Android', gpu: 'other', mem: 4, cores: 8,
  p: { why: 'end', secs: 300, fps: 60, p5: 50, long: 0, lv0: 'high', lvMin: 'high', lv: 'high', mobs: 100, nth: 1, tex: 100, texUp: 0, texMB: 80, nodes: 1000, nodesUp: 600, ...p },
  ...over,
});
const times = (n: number, f: (i: number) => PerfSnap) => Array.from({ length: n }, (_, i) => f(i));
const anomaly = (build: string, p: Record<string, PropValue>, n = 1): AnomalyCount => ({ ...anomalyKey('2026-10-01', build, { place: 'run', ...p }), n });
const rules = (snaps: PerfSnap[], anomalies: AnomalyCount[] = []) => diagnose(snaps, anomalies).map((f) => `${f.level} ${f.rule} ${f.where}`);

describe('diagnose', () => {
  it('finds nothing in healthy battles', () => {
    expect(diagnose(times(30, () => snap({})), [])).toEqual([]);
  });

  it('calls a leak within runs, and names textures before display objects before JS', () => {
    const tex = diagnose(times(5, () => snap({}, { texUp: 25, nodesUp: 5000 })), []);
    expect(tex).toMatchObject([{ level: 'bad', rule: 'leak_in_run', where: 'build 5', n: 5 }]);
    expect(tex[0].hint).toMatch(/^textures/);
    // 300 s: 20 MB is 4 MB a minute; 600 + 6 × 100 nodes is the horde, 2300 is 1100 past it
    const nodes = diagnose(times(5, () => snap({}, { heap: 200, heapUp: 20, nodesUp: 2300 })), []);
    expect(nodes[0].hint).toMatch(/^sprites/);
    expect(nodes[0].detail).toContain('heap +4 MB per battle minute');
    expect(diagnose(times(5, () => snap({}, { heap: 200, heapUp: 20 })), [])[0].hint).toMatch(/^plain JS/);
  });

  it('wants five long runs before calling a leak', () => {
    expect(rules(times(4, () => snap({}, { texUp: 25 })))).toEqual([]);
    expect(rules(times(5, () => snap({}, { secs: 100, texUp: 25 })))).toEqual([]);
    expect(rules(times(5, () => snap({}, { why: 'mid', texUp: 25 })))).toEqual([]);
  });

  it('calls a leak across runs when later runs start higher', () => {
    const first = times(3, () => snap({}, { nth: 1, tex: 100, texUp: 0 }));
    const later = times(3, () => snap({}, { nth: 3, tex: 130, texUp: 0 }));
    const f = diagnose([...first, ...later], []);
    expect(f).toMatchObject([{ level: 'bad', rule: 'leak_across_runs', where: 'build 5', n: 6 }]);
    expect(f[0].detail).toContain('textures 100 → 130');
    expect(f[0].hint).toContain('client/src/ui/Shell.ts');
    expect(rules([...first, ...times(3, () => snap({}, { nth: 3, tex: 110 }))])).toEqual([]);
    expect(rules([...first, ...later.slice(1)])).toEqual([]);
  });

  it('flags snapshots holding too much memory per device class', () => {
    expect(rules(times(3, () => snap({}, { heap: 900 })))).toEqual(['warn heap_high mobile']);
    expect(rules(times(10, () => snap({}, { why: 'mid', secs: 60, texMB: 450 })))).toEqual(['bad heap_high mobile']);
    expect(rules(times(2, () => snap({}, { heap: 900 })))).toEqual([]);
  });

  it('counts memory warnings, lost contexts and stalls per build', () => {
    const f = diagnose(times(12, () => snap({ build: '6' })), [
      anomaly('6', { kind: 'memory', level: 15 }, 2), anomaly('6', { kind: 'memory', level: 10 }), anomaly('5', { kind: 'memory' }, 2),
      anomaly('6', { kind: 'webgl_lost' }, 3), anomaly('6', { kind: 'stall', ms: 1500 }, 6), anomaly('7', { kind: 'stall', ms: 1500 }, 9),
    ]);
    expect(f.map((x) => `${x.level} ${x.rule} ${x.where} ${x.n}`)).toEqual(['bad memory_warning build 6 3', 'bad webgl_lost build 6 3', 'warn stalls build 6 6']);
    expect(f[0].detail).toContain('level 15: 2, level 10: 1');
    expect(f[2].detail).toContain('in 1 battle hours (6 per hour)');
  });

  it('lists repeated errors by message and source, the most frequent first', () => {
    const f = diagnose([], [
      anomaly('5', { kind: 'error', msg: 'boom', src: 'a.js:1:2' }, 3), anomaly('6', { kind: 'error', msg: 'boom', src: 'a.js:1:2' }, 3),
      anomaly('6', { kind: 'error', msg: 'oops', src: 'b.js:3:4' }, 2), anomaly('6', { kind: 'error', msg: 'once' }),
    ]);
    expect(f.map((x) => `${x.level} ${x.where} ${x.n}`)).toEqual(['bad a.js:1:2 6', 'warn b.js:3:4 2']);
    expect(f[0].detail).toBe('"boom" thrown 6 times, builds 6, 5.');
  });

  it('flags a slow device and GPU', () => {
    const slow = times(5, (i) => snap({ gpu: 'weak', mem: 2 }, { p5: 20, lvMin: i < 3 ? 'low' : 'phone' }));
    const f = diagnose([...slow, ...times(5, () => snap({}))], []);
    expect(f).toMatchObject([{ level: 'warn', rule: 'slow_device', where: 'mobile / gpu weak', n: 5 }]);
    expect(f[0].detail).toContain('3 dropped below the phone quality level');
  });

  it('flags a frame-rate drop against the previous build with enough runs', () => {
    const old = times(10, () => snap({ build: '9' }, { p5: 50 }));
    const fresh = times(10, () => snap({ build: '10' }, { p5: 44 }));
    expect(rules([...old, ...fresh, ...times(3, () => snap({ build: '11' }, { p5: 10 }))])).toEqual(['bad fps_regression mobile']);
    expect(rules([...old, ...times(10, () => snap({ build: '10' }, { p5: 46 }))])).toEqual([]);
  });

  it('puts problems first, then the biggest', () => {
    const f = diagnose([], [anomaly('5', { kind: 'error', msg: 'a' }, 4), anomaly('5', { kind: 'error', msg: 'b' }, 5), anomaly('5', { kind: 'webgl_lost' }, 3)]);
    expect(f.map((x) => `${x.level} ${x.rule} ${x.n}`)).toEqual(['bad errors 5', 'bad webgl_lost 3', 'warn errors 4']);
  });
});
