import { describe, expect, it } from 'vitest';
import { BATTLE_FPS, CALM_FPS, FrameGate, FrameGovernor, LEVELS, levelRange, lowBattery, startLevel, targetFps, useMsaa, type DeviceInfo } from './quality';

const PC: DeviceInfo = { mobile: false, cores: 8, memoryGB: 8, gpu: 'ANGLE (Intel, Intel(R) Arc(TM) Graphics)', modelLevel: 0 };
const PHONE: DeviceInfo = { mobile: true, cores: 8, memoryGB: 8, gpu: 'Adreno (TM) 740', modelLevel: 0 };

/** Feeds `seconds` of frames at `fps`; returns the levels the governor passed through. */
function run(g: FrameGovernor, fps: number, seconds: number): number[] {
  const seen: number[] = [];
  for (let t = 0; t < seconds; t += 1 / fps) if (g.sample(1 / fps)) seen.push(g.level);
  return seen;
}

describe('startLevel', () => {
  it('puts desktops on the top level and strong phones on the phone level', () => {
    expect(LEVELS[startLevel(PC)].name).toBe('high');
    expect(LEVELS[startLevel(PHONE)].name).toBe('phone');
    expect(startLevel({ ...PHONE, modelLevel: 1, cores: 4 })).toBe(startLevel(PHONE));
  });

  it('starts weak devices lower', () => {
    expect(startLevel({ ...PC, gpu: 'Google SwiftShader' })).toBeLessThan(startLevel(PC));
    const weak = startLevel({ ...PHONE, gpu: 'Mali-G52' });
    expect(weak).toBe(startLevel(PHONE) - 1);
    expect(startLevel({ ...PHONE, gpu: 'Mali-G52', memoryGB: 3, modelLevel: 3 })).toBe(weak - 1);
  });
});

describe('levelRange and useMsaa', () => {
  it('locks forced modes and lets auto range below the start', () => {
    expect(levelRange('saver', PC)).toEqual({ start: 0, min: 0, max: 0 });
    expect(levelRange('high', PHONE).min).toBe(LEVELS.length - 1);
    expect(levelRange('auto', PHONE)).toEqual({ start: startLevel(PHONE), min: 0, max: startLevel(PHONE) });
  });

  it('keeps MSAA for desktops and forced high', () => {
    expect(useMsaa('auto', PC)).toBe(true);
    expect(useMsaa('auto', PHONE)).toBe(false);
    expect(useMsaa('high', PHONE)).toBe(true);
    expect(useMsaa('saver', PC)).toBe(false);
  });
});

/** Runs `gate` over `n` refreshes `ms` apart (plus `jitter(i)`); returns the gaps between passed frames. */
function gaps(gate: FrameGate, n: number, ms: number, jitter = (_i: number) => 0, from = 0): number[] {
  const out: number[] = [];
  let last = NaN;
  for (let i = 0; i < n; i++) {
    const t = from + i * ms + jitter(i);
    if (!gate.pass(t)) continue;
    if (!Number.isNaN(last)) out.push(Math.round((t - last) * 10) / 10);
    last = t;
  }
  return out;
}

describe('FrameGate', () => {
  it('runs every other frame of a 120 Hz screen at 60 fps, evenly', () => {
    const g = gaps(new FrameGate(60), 240, 1000 / 120, (i) => (i % 3) * 0.4);
    expect(g.length).toBe(119);
    expect(Math.max(...g)).toBeLessThanOrEqual(17.5);
    expect(Math.min(...g)).toBeGreaterThanOrEqual(15.8);
  });

  it('never skips a refresh of a 60 Hz screen running a little fast or jittery', () => {
    expect(gaps(new FrameGate(60), 600, 1000 / 60.1).length).toBe(599);
    const jittery = gaps(new FrameGate(60), 600, 1000 / 60, (i) => (i % 2 ? 1.5 : -1.5));
    expect(jittery.length).toBe(599);
  });

  it('locks to the display: every frame of 90 Hz, every other of 144 Hz, never a mix', () => {
    expect(gaps(new FrameGate(60), 270, 1000 / 90).length).toBe(269);
    const g = new FrameGate(60);
    const at144 = gaps(g, 288, 1000 / 144);
    expect(new Set(at144.map((x) => Math.round(x)))).toEqual(new Set([14]));
    expect(g.frameMs).toBeCloseTo(2000 / 144, 1);
  });

  it('runs the next frame on time after a late one, no short catch-up frame', () => {
    const gate = new FrameGate(60);
    gaps(gate, 60, 1000 / 60);
    // a refresh is missed: the frame lands at 2 vsyncs, then the next ones are a vsync apart again
    const g = gaps(gate, 30, 1000 / 60, () => 0, 61 * (1000 / 60));
    expect(g.every((x) => Math.abs(x - 16.7) < 0.1)).toBe(true);
    expect(gate.pass(91 * (1000 / 60) + 3)).toBe(true);
  });

  it('passes every frame of a slower screen and resyncs after a stall', () => {
    const gate = new FrameGate(60);
    expect(gaps(gate, 60, 1000 / 50).length).toBe(59);
    expect(gate.frameMs).toBeCloseTo(20, 1);
    expect(gate.pass(5000)).toBe(true);
    expect(gate.pass(5000 + 8)).toBe(false);
    expect(gate.pass(5000 + 20)).toBe(true);
  });
});

describe('lowBattery', () => {
  it('turns on at 20% unplugged and off only over 30% or once charging', () => {
    expect(lowBattery({ level: 0.25, charging: false }, false)).toBe(false);
    expect(lowBattery({ level: 0.2, charging: false }, false)).toBe(true);
    expect(lowBattery({ level: 0.25, charging: false }, true)).toBe(true);
    expect(lowBattery({ level: 0.31, charging: false }, true)).toBe(false);
    expect(lowBattery({ level: 0.1, charging: true }, true)).toBe(false);
    expect(lowBattery({ level: NaN, charging: false }, false)).toBe(false);
  });

  it('pins auto to saver, leaves a forced mode alone', () => {
    const phone: DeviceInfo = { mobile: true, cores: 8, memoryGB: 8, gpu: '', modelLevel: 0 };
    expect(levelRange('auto', phone, true)).toEqual({ start: 0, min: 0, max: 0 });
    expect(levelRange('high', phone, true).start).toBe(LEVELS.length - 1);
  });
});

describe('targetFps', () => {
  it('runs every battle at the display rate up to 60, calm screens at 30', () => {
    expect(targetFps(false)).toBe(BATTLE_FPS);
    expect(BATTLE_FPS).toBe(60);
    expect(targetFps(true)).toBe(CALM_FPS);
  });

  it('halves a 60 Hz screen once the gate drops to the calm rate', () => {
    const gate = new FrameGate(60);
    gaps(gate, 60, 1000 / 60);
    gate.fps = CALM_FPS;
    const g = gaps(gate, 60, 1000 / 60, () => 0, 60 * (1000 / 60));
    expect(g.length).toBe(29);
    expect(gate.frameMs).toBeCloseTo(2000 / 60, 1);
  });
});

describe('FrameGovernor', () => {
  it('steps down after a few slow seconds, not after a short dip', () => {
    const g = new FrameGovernor({ start: 3, min: 0, max: 3 });
    expect(run(g, 40, 2)).toEqual([]);
    expect(run(g, 60, 4)).toEqual([]);
    expect(run(g, 40, 6)).toEqual([2]);
  });

  it('ignores pauses and stops at the bottom', () => {
    const g = new FrameGovernor({ start: 1, min: 0, max: 1 });
    expect(g.sample(3)).toBe(false);
    run(g, 20, 30);
    expect(g.level).toBe(0);
  });

  it('climbs back slowly and backs off after a failed try', () => {
    const g = new FrameGovernor({ start: 3, min: 0, max: 3 });
    run(g, 40, 4.5);
    expect(g.level).toBe(2);
    expect(run(g, 60, 25)).toEqual([]);
    expect(run(g, 60, 6.5)).toEqual([3]);
    // the phone is still hot: the new level fails right away, so the next try waits longer
    expect(run(g, 40, 6)).toEqual([2]);
    expect(run(g, 60, 40)).toEqual([]);
    expect(run(g, 60, 25)).toEqual([3]);
  });

  it('never climbs above its range', () => {
    const g = new FrameGovernor({ start: 2, min: 0, max: 2 });
    expect(run(g, 60, 120)).toEqual([]);
  });
});
