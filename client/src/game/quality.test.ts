import { describe, expect, it } from 'vitest';
import { CALM_FPS, FrameGate, FrameGovernor, LEVELS, levelRange, startLevel, targetFps, useMsaa, type DeviceInfo } from './quality';

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

describe('FrameGate', () => {
  it('runs every other frame of a 120 Hz screen at 60 fps', () => {
    const gate = new FrameGate(60);
    let ran = 0;
    for (let i = 0; i < 120; i++) if (gate.pass(i * (1000 / 120) + (i % 3) * 0.4)) ran++;
    expect(ran).toBe(60);
  });

  it('passes every frame of a slower screen and resyncs after a stall', () => {
    const gate = new FrameGate(60);
    let ran = 0;
    for (let i = 0; i < 60; i++) if (gate.pass(i * (1000 / 50))) ran++;
    expect(ran).toBe(60);
    expect(gate.pass(5000)).toBe(true);
    expect(gate.pass(5000 + 8)).toBe(false);
    expect(gate.pass(5000 + 16.7)).toBe(true);
  });
});

describe('targetFps', () => {
  it('caps calm screens below the battle rate, never above the level', () => {
    expect(targetFps(LEVELS[3], false)).toBe(60);
    expect(targetFps(LEVELS[3], true)).toBe(CALM_FPS);
    expect(targetFps(LEVELS[0], true)).toBe(Math.min(CALM_FPS, LEVELS[0].fps));
  });

  it('halves a 60 Hz screen once the gate drops to the calm rate', () => {
    const gate = new FrameGate(60);
    for (let i = 0; i < 60; i++) gate.pass(i * (1000 / 60));
    gate.fps = CALM_FPS;
    let ran = 0;
    for (let i = 60; i < 120; i++) if (gate.pass(i * (1000 / 60))) ran++;
    expect(ran).toBe(30);
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
