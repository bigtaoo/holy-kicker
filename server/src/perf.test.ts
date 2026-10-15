import { describe, expect, it } from 'vitest';
import { anomaliesOf, anomalyKey, droppedBelowPhone, middle, perfOf, sessionDevice, type PerfSnap } from './perf';
import type { ClientEvent, EventBatch, PropValue } from './protocol';
import { MemoryStore, PERF_KEEP_DAYS, PRUNE_EVERY_DAYS } from './store';

const snap = (over: Partial<PerfSnap>, p: Record<string, PropValue>): PerfSnap => ({
  day: '2026-10-01', host: 'web', build: '1', device: 'mobile', os: 'Android', gpu: 'other', mem: 4, cores: 8,
  p: { why: 'end', secs: 60, fps: 60, p5: 50, long: 0, lv0: 'high', lvMin: 'high', lv: 'high', mobs: 100, nth: 1, ...p }, ...over,
});

describe('perf', () => {
  it('takes the upper middle', () => {
    expect(middle([])).toBe(0);
    expect(middle([3, 1, 2])).toBe(2);
    expect(middle([4, 1, 3, 2])).toBe(3);
  });

  it('counts a run as dropped only below phone', () => {
    expect(['saver', 'low', 'mid'].map(droppedBelowPhone)).toEqual([true, true, true]);
    expect(['phone', 'high', 'ultra', undefined].map(droppedBelowPhone)).toEqual([false, false, false, false]);
  });

  it('reads the launch device from a session event, with defaults', () => {
    expect(sessionDevice({ mem: 2, cores: 4, gpu: 'weak' })).toEqual({ gpu: 'weak', mem: 2, cores: 4 });
    expect(sessionDevice(undefined)).toEqual({ gpu: 'unknown', mem: 0, cores: 0 });
  });

  it('groups snapshots by device, system and build', () => {
    const r = perfOf([
      snap({}, { fps: 58, p5: 40, long: 6, heap: 120, tex: 300, texMB: 90, nodes: 2000 }),
      snap({}, { why: 'mid', secs: 120, fps: 30, p5: 12, long: 30, lvMin: 'low', tex: 320, texMB: 110, nodes: 4000 }),
      snap({ build: '2' }, { fps: 50, p5: 20, lvMin: 'mid', heap: 200 }),
      snap({ device: 'desktop', os: 'Windows', build: '10' }, { fps: 60, p5: 59 }),
      snap({ device: 'desktop' }, { secs: 0, fps: 1, p5: 1 }),
    ]);
    expect(r.byDevice).toEqual([
      { label: 'mobile', snaps: 3, minutes: 4, fps: 50, p5: 20, longPerMin: 9, low: 2, heap: 200, tex: 320, texMB: 110, nodes: 4000, mids: 1 },
      { label: 'desktop', snaps: 1, minutes: 1, fps: 60, p5: 59, longPerMin: 0, low: 0, heap: null, tex: null, texMB: null, nodes: null, mids: 0 },
    ]);
    expect(r.byOs.map((o) => [o.label, o.snaps])).toEqual([['Android', 3], ['Windows', 1]]);
    expect(r.byBuild.map((b) => [b.label, b.snaps])).toEqual([['10', 1], ['2', 1], ['1', 2]]);
  });

  it('lists the worst long-enough snapshots, lowest p5 first', () => {
    const many = Array.from({ length: 14 }, (_, i) => snap({ day: `2026-10-${String(i + 1).padStart(2, '0')}` }, { p5: 40 - i }));
    const r = perfOf([...many, snap({}, { secs: 10, p5: 1 })]);
    expect(r.worst).toHaveLength(10);
    expect(r.worst[0]).toEqual({ day: '2026-10-14', host: 'web', build: '1', device: 'mobile', os: 'Android', gpu: 'other', mem: 4, cores: 8, secs: 60, fps: 60, p5: 27, lvMin: 'high', mobs: 100, texMB: null, nodes: null });
    expect(r.worst.map((w) => w.p5)).toEqual([27, 28, 29, 30, 31, 32, 33, 34, 35, 36]);
  });

  it('counts anomalies by day, by build, errors by message and source, memory warnings by level', () => {
    const r = anomaliesOf([
      { ...anomalyKey('2026-10-02', '9', { kind: 'error', place: 'run', msg: 'x is undefined', src: 'index.js:1:20' }), n: 3 },
      { ...anomalyKey('2026-10-01', '9', { kind: 'error', place: 'run', msg: 'boom' }), n: 1 },
      { ...anomalyKey('2026-10-02', '10', { kind: 'error', place: 'lobby', msg: 'x is undefined', src: 'index.js:1:20' }), n: 2 },
      { ...anomalyKey('2026-10-02', '10', { kind: 'error', place: 'lobby', msg: 'x is undefined', src: 'index.js:9:9' }), n: 1 },
      { ...anomalyKey('2026-10-02', '10', { kind: 'memory', place: 'run', level: 10 }), n: 1 },
      { ...anomalyKey('2026-10-02', '10', { kind: 'memory', place: 'run' }), n: 2 },
      { ...anomalyKey('2026-10-01', '9', { kind: 'webgl_lost', place: 'run' }), n: 1 },
    ]);
    expect(r.days).toEqual([
      { day: '2026-10-01', kind: 'error', n: 1 }, { day: '2026-10-01', kind: 'webgl_lost', n: 1 },
      { day: '2026-10-02', kind: 'error', n: 6 }, { day: '2026-10-02', kind: 'memory', n: 3 },
    ]);
    expect(r.builds).toEqual([
      { build: '10', kind: 'error', n: 3 }, { build: '10', kind: 'memory', n: 3 },
      { build: '9', kind: 'error', n: 4 }, { build: '9', kind: 'webgl_lost', n: 1 },
    ]);
    expect(r.errors).toEqual([
      { msg: 'x is undefined', src: 'index.js:1:20', n: 5 }, { msg: 'boom', src: '', n: 1 }, { msg: 'x is undefined', src: 'index.js:9:9', n: 1 },
    ]);
    expect(r.memory).toEqual([{ level: 0, n: 2 }, { level: 10, n: 1 }]);
  });

  it('reaches /v1/stats through the store, with the install\'s device, the launch\'s GPU and the host filter', async () => {
    const DAY0 = Date.parse('2026-10-01T10:00:00Z');
    const s = new MemoryStore();
    const launch: ClientEvent = { e: 'session', t: DAY0, p: { runs: 0, level: 1, device: 'tablet', mem: 2, cores: 4, gpu: 'weak' } };
    const perf: ClientEvent = { e: 'perf', t: DAY0, p: { why: 'leave', secs: 90, fps: 55, p5: 33, long: 3, lv0: 'high', lvMin: 'mid', lv: 'mid', mobs: 80, nth: 1, heap: 90, tex: 40, texUp: 2, texMB: 60, nodes: 900, nodesUp: 500 } };
    const lost: ClientEvent = { e: 'anomaly', t: DAY0, p: { kind: 'webgl_lost', place: 'run', wave: 12 } };
    const batch = (install: string, session: string, host: EventBatch['host'], events: ClientEvent[]): EventBatch => ({ install, session, host, build: '7', locale: 'en', events });
    await s.addEvents(batch('install-p', 'session01', 'crazygames', [launch]), DAY0, { device: 'tablet', browser: 'Safari', os: 'iOS', country: 'US' });
    await s.addEvents(batch('install-p', 'session01', 'crazygames', [perf, lost]), DAY0);
    await s.addEvents(batch('install-w', 'session02', 'web', [perf]), DAY0);
    const r = await s.stats(1, DAY0, 'crazygames');
    expect(r.perf.byDevice).toEqual([{ label: 'tablet', snaps: 1, minutes: 1.5, fps: 55, p5: 33, longPerMin: 2, low: 1, heap: 90, tex: 40, texMB: 60, nodes: 900, mids: 0 }]);
    expect(r.perf.worst[0]).toMatchObject({ device: 'tablet', os: 'iOS', gpu: 'weak', mem: 2, cores: 4, lvMin: 'mid', texMB: 60, nodes: 900 });
    expect(r.anomalies.days).toEqual([{ day: '2026-10-01', kind: 'webgl_lost', n: 1 }]);
    expect(r.anomalies.builds).toEqual([{ build: '7', kind: 'webgl_lost', n: 1 }]);
    expect(r.diagnosis).toEqual([]);
    const all = await s.stats(1, DAY0, null);
    expect(all.perf.byOs.map((o) => [o.label, o.snaps])).toEqual([['iOS', 1], ['unknown', 1]]);
    expect(all.perf.worst.map((w) => [w.gpu, w.mem])).toEqual([['weak', 2], ['unknown', 0]]);
  });

  it('prunes perf and anomaly events past PERF_KEEP_DAYS, at most once a week', async () => {
    const DAY = 86_400_000, NOW = Date.parse('2026-10-30T12:00:00Z');
    const s = new MemoryStore();
    const events: ClientEvent[] = [
      { e: 'session', t: NOW }, { e: 'perf', t: NOW, p: { why: 'end', secs: 60 } }, { e: 'anomaly', t: NOW, p: { kind: 'stall', place: 'run' } }, { e: 'run_end', t: NOW, p: { chapter: 1, wave: 3 } },
    ];
    const batch = (): EventBatch => ({ install: 'install-x', session: 'session01', host: 'web', build: '7', locale: 'en', events: [...events] });
    await s.addEvents(batch(), NOW - (PERF_KEEP_DAYS + 1) * DAY);
    await s.addEvents(batch(), NOW - (PERF_KEEP_DAYS - 1) * DAY);
    expect(await s.prune(NOW)).toBe(2);
    expect(s.events.map((b) => b.events.map((e) => e.e).join(' '))).toEqual(['session run_end', 'session perf anomaly run_end']);
    // not due again within the week, whatever has aged meanwhile
    expect(await s.prune(NOW + (PRUNE_EVERY_DAYS - 1) * DAY)).toBeNull();
    expect(await s.prune(NOW + PRUNE_EVERY_DAYS * DAY)).toBe(2);
    expect(s.events[1].events.map((e) => e.e)).toEqual(['session', 'run_end']);
  });
});
