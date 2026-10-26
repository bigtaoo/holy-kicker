import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { LEVELS } from './quality';
import { QualityRuntime, RESIZE_WAIT_MS } from './qualityRuntime';

const MID = LEVELS.findIndex((l) => l.name === 'mid');
const LOW = LEVELS.findIndex((l) => l.name === 'low');

/**
 * A runtime on a fake app at device density `density` starting on `start`, its frames stepped by hand at
 * 60 Hz, in a battle once `battle()` is called. Its governor moves to `state.to` on the next
 * battle frame after that is set, and never otherwise.
 */
function rig(start = MID, density = 3) {
  let loop: (now: number) => void = () => {};
  vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => ((loop = cb), 1));
  const resizes: number[] = [];
  const renderer = { resolution: density, resize: (_w: number, _h: number, res: number) => void resizes.push((renderer.resolution = res)) };
  const app = { renderer, screen: { width: 1080, height: 1920 }, ticker: { autoStart: true, stop() {}, update() {} } } as unknown as Application;
  const state = { calm: true, sharp: true, to: -1, density };
  const rt = new QualityRuntime(app, { min: 0, max: MID, start }, () => {}, () => state.calm, () => state.sharp, () => state.density);
  const governor = {
    level: start,
    sample() {
      if (state.to < 0) return false;
      [governor.level, state.to] = [state.to, -1];
      return true;
    },
  };
  rt.governor = governor as unknown as QualityRuntime['governor'];
  let now = 0;
  const frames = (n: number) => {
    for (let i = 0; i < n; i++) loop((now += 1000 / 60));
  };
  const battle = () => {
    state.sharp = state.calm = false;
    frames(30);
    resizes.length = 0;
  };
  return { rt, renderer, resizes, state, frames, battle };
}

describe('QualityRuntime', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sizes the canvas as a run comes and goes', () => {
    const { renderer, state, frames } = rig();
    frames(10);
    expect(renderer.resolution).toBe(3);
    state.sharp = state.calm = false;
    frames(2);
    expect(renderer.resolution).toBe(LEVELS[MID].resolution);
    state.sharp = state.calm = true;
    frames(2);
    expect(renderer.resolution).toBe(3);
  });

  it('follows the display density as the browser zooms or the window changes screens', () => {
    const { renderer, state, frames } = rig(MID, 1);
    frames(2);
    expect(renderer.resolution).toBe(1);
    state.density = 1.5;
    frames(1);
    expect(renderer.resolution).toBe(1.5);
    state.sharp = state.calm = false;
    frames(2);
    expect(renderer.resolution).toBe(1.5);
  });

  it('holds a step down to its old canvas until a calm frame', () => {
    const { rt, renderer, resizes, state, frames, battle } = rig();
    battle();
    state.to = LOW;
    frames(60);
    expect(rt.settings.name).toBe('low');
    expect(resizes).toEqual([]);
    // the level-up cards: the run stops stepping, and the canvas follows the level
    state.calm = true;
    frames(4);
    expect(resizes).toEqual([LEVELS[LOW].resolution]);
    expect(renderer.resolution).toBe(LEVELS[LOW].resolution);
  });

  it('holds a step down whose run came in at the device density, with no resize then', () => {
    const { resizes, state, frames, battle } = rig(MID, LEVELS[MID].resolution);
    battle();
    state.to = LOW;
    frames(60);
    expect(resizes).toEqual([]);
    state.calm = true;
    frames(4);
    expect(resizes).toEqual([LEVELS[LOW].resolution]);
  });

  it('sizes the canvas anyway once a step down waited RESIZE_WAIT_MS of battle', () => {
    const { resizes, state, frames, battle } = rig();
    battle();
    state.to = LOW;
    frames(Math.floor((RESIZE_WAIT_MS / 1000) * 60) - 5);
    expect(resizes).toEqual([]);
    frames(10);
    expect(resizes).toEqual([LEVELS[LOW].resolution]);
  });

  it('holds a step up to its old canvas until a calm frame, however long', () => {
    const { rt, resizes, state, frames, battle } = rig(LOW);
    battle();
    state.to = MID;
    frames(60 * 60);
    expect(rt.settings.name).toBe('mid');
    expect(resizes).toEqual([]);
    state.calm = true;
    frames(4);
    expect(resizes).toEqual([LEVELS[MID].resolution]);
  });

  it('never resizes for a try up stepped back before a calm frame', () => {
    const { resizes, state, frames, battle } = rig(LOW);
    battle();
    state.to = MID;
    frames(60);
    state.to = LOW;
    frames(60 * 5);
    state.calm = true;
    frames(4);
    expect(resizes).toEqual([]);
  });
});
