import { describe, expect, it } from 'vitest';
import { IDLE_SHOT, KILL_CAM, KillCam, focusPoint, killCamLength, mixColor, mulColor, shotAt } from './killCam';

describe('shotAt', () => {
  it('eases in, holds at full zoom in slow motion, and eases back out', () => {
    expect(shotAt(0)).toMatchObject({ phase: 'in', zoom: 1, mix: 0, scale: KILL_CAM.scale });
    const mid = shotAt(KILL_CAM.easeIn / 2);
    expect(mid.zoom).toBeGreaterThan(1);
    expect(mid.zoom).toBeLessThan(KILL_CAM.zoom);
    expect(shotAt(KILL_CAM.easeIn + 0.01)).toMatchObject({ phase: 'hold', zoom: KILL_CAM.zoom, mix: 1 });
    const out = shotAt(killCamLength() - 0.01);
    expect(out.phase).toBe('out');
    expect(out.mix).toBeLessThan(0.05);
  });

  it('is idle before and after the cam', () => {
    expect(shotAt(-1)).toBe(IDLE_SHOT);
    expect(shotAt(killCamLength())).toBe(IDLE_SHOT);
    expect(IDLE_SHOT.scale).toBe(1);
  });

  it('keeps the pulse within 0..1', () => {
    for (let t = 0; t < killCamLength(); t += 0.05) {
      const p = shotAt(t).pulse;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('KillCam', () => {
  it('runs for about a second of real time after start, then goes idle', () => {
    const c = new KillCam();
    expect(c.busy).toBe(false);
    expect(c.step(0.1)).toBe(IDLE_SHOT);
    c.start();
    let frames = 0;
    while (c.busy && frames < 1000) {
      c.step(1 / 60);
      frames++;
    }
    expect(frames / 60).toBeCloseTo(killCamLength(), 1);
    expect(killCamLength()).toBeGreaterThan(0.8);
    expect(killCamLength()).toBeLessThan(1.5);
  });

  it('stops at once', () => {
    const c = new KillCam();
    c.start();
    c.step(0.2);
    c.stop();
    expect(c.busy).toBe(false);
    expect(c.step(0.1)).toBe(IDLE_SHOT);
  });
});

describe('focusPoint', () => {
  it('is halfway between the hero and a near source', () => {
    expect(focusPoint(0, 0, 100, 50)).toEqual({ x: 50, y: 25 });
  });

  it('clamps a far source to the reach', () => {
    const f = focusPoint(0, 0, 4000, 0, 400);
    expect(f.x).toBeCloseTo(200);
    expect(f.y).toBeCloseTo(0);
  });

  it('stays on the hero when the source is on him', () => {
    expect(focusPoint(10, 20, 10, 20)).toEqual({ x: 10, y: 20 });
  });
});

describe('colours', () => {
  it('multiplies like a tint', () => {
    expect(mulColor(0xffffff, 0xff4040)).toBe(0xff4040);
    expect(mulColor(0x808080, 0xffffff)).toBe(0x808080);
    expect(mulColor(0x123456, 0x000000)).toBe(0);
  });

  it('blends per channel', () => {
    expect(mixColor(0xffffff, 0xff0000, 0)).toBe(0xffffff);
    expect(mixColor(0xffffff, 0xff0000, 1)).toBe(0xff0000);
    expect(mixColor(0x000000, 0xff8000, 0.5)).toBe(0x804000);
  });
});
