import { PERF_MID_MAX, PERF_MID_SECS } from '@hk/protocol';
import { describe, expect, it } from 'vitest';
import { gpuClass, PerfMeter } from './perfMeter';

/** Feeds `n` frames of `ms` on `level` with `mobs` alive. */
function feed(m: PerfMeter, n: number, ms: number, level = 4, mobs = 100): void {
  for (let i = 0; i < n; i++) m.frame(ms, level, mobs);
}

describe('PerfMeter', () => {
  it('gives the median and 5th-percentile frame rate of a mixed stream', () => {
    const m = new PerfMeter();
    feed(m, 900, 1000 / 60);
    feed(m, 80, 1000 / 40);
    feed(m, 40, 1000 / 20);
    const s = m.snapshot('end')!;
    expect(s).toMatchObject({ why: 'end', fps: 60, p5: 40, long: 40, lv0: 'high', lvMin: 'high', lv: 'high', mobs: 100 });
    expect(s.secs).toBe(19);
  });

  it('counts a pause as long but leaves it out of the rates and the seconds', () => {
    const m = new PerfMeter();
    feed(m, 600, 1000 / 60);
    m.frame(30_000, 4, 0);
    const s = m.snapshot('leave')!;
    expect(s).toMatchObject({ secs: 10, fps: 60, p5: 60, long: 1 });
  });

  it('caps fast screens at 120 fps', () => {
    const m = new PerfMeter();
    feed(m, 1440, 1000 / 144);
    expect(m.snapshot('end')!.fps).toBe(120);
  });

  it('makes no snapshot under five seconds, and keeps measuring', () => {
    const m = new PerfMeter();
    feed(m, 120, 1000 / 60);
    expect(m.snapshot('leave')).toBeNull();
    feed(m, 240, 1000 / 60);
    expect(m.snapshot('end')!.secs).toBe(6);
  });

  it('starts each snapshot afresh but keeps the levels and the peak mobs for the run', () => {
    const m = new PerfMeter();
    feed(m, 300, 1000 / 60, 3, 250);
    feed(m, 300, 1000 / 30, 1, 80);
    feed(m, 300, 1000 / 60, 2, 80);
    expect(m.snapshot('leave')).toMatchObject({ lv0: 'phone', lvMin: 'low', lv: 'mid', mobs: 250 });
    feed(m, 600, 1000 / 60, 2, 50);
    expect(m.snapshot('end')).toMatchObject({ secs: 10, fps: 60, long: 0, lv0: 'phone', lvMin: 'low', lv: 'mid', mobs: 250 });
  });

  it('asks for a mid snapshot every few battle minutes, up to the cap', () => {
    const m = new PerfMeter();
    let mids = 0;
    for (let i = 0; i < 60 * PERF_MID_SECS * (PERF_MID_MAX + 2); i++) {
      m.frame(1000 / 60, 4, 0);
      if (i === 60 * PERF_MID_SECS - 10) expect(m.midDue()).toBe(false);
      if (m.midDue()) {
        mids++;
        expect(m.snapshot('mid')!.secs).toBe(PERF_MID_SECS);
      }
    }
    expect(mids).toBe(PERF_MID_MAX);
  });

  it('keeps measuring through a mid snapshot looked at and not sent', () => {
    const m = new PerfMeter();
    for (let i = 0; i < 60 * PERF_MID_SECS + 1; i++) m.frame(1000 / 60, 4, 0);
    expect(m.midDue()).toBe(true);
    expect(m.snapshot('mid', true)!.secs).toBe(PERF_MID_SECS);
    expect(m.midDue()).toBe(false);
    for (let i = 0; i < 600; i++) m.frame(1000 / 60, 4, 0);
    expect(m.snapshot('end')!.secs).toBe(PERF_MID_SECS + 10);
  });
});

describe('gpuClass', () => {
  it('sorts renderer strings into the coarse classes', () => {
    expect(gpuClass('')).toBe('hidden');
    expect(gpuClass('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))')).toBe('software');
    expect(gpuClass('Mali-G52 MC2')).toBe('weak');
    expect(gpuClass('Adreno (TM) 740')).toBe('other');
    expect(gpuClass('Apple GPU')).toBe('other');
  });
});
