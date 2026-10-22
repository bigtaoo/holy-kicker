import { describe, expect, it, vi } from 'vitest';
import { Rectangle, Texture, TextureSource } from 'pixi.js';
import { DEFAULT_RUN, type SimState } from '@hk/engine';
import { fill, LATE_FROM, lateArt, lateArtReady, lateHold, loadLate, mayNeedLate, placeholder, toFill } from './lateArt';

type Run = Pick<SimState, 'wave' | 'config' | 'players'>;
const run = (wave: number, level = 1, config = {}): Run => ({ wave, config: { ...DEFAULT_RUN, ...config }, players: [{ level }] as SimState['players'] });

describe('mayNeedLate', () => {
  it('is false only in a first run’s opening: wave 1, the ball, no sutras, below level 3', () => {
    expect(mayNeedLate(run(0))).toBe(false);
    expect(mayNeedLate(run(LATE_FROM.wave - 1, LATE_FROM.level - 1))).toBe(false);
    expect(mayNeedLate(run(LATE_FROM.wave))).toBe(true);
    expect(mayNeedLate(run(1, LATE_FROM.level))).toBe(true);
    expect(mayNeedLate(run(1, 1, { relic: 'staff' }))).toBe(true);
    expect(mayNeedLate(run(1, 1, { sutras: ['lion'] }))).toBe(true);
  });
});

describe('placeholder and fill', () => {
  it('fills a whole-image placeholder and a slice in place, with the new size and uvs', () => {
    const whole = placeholder();
    const slice = new Texture({ source: whole.source, frame: new Rectangle(10, 0, 10, 20) });
    toFill([slice]);
    const seen = vi.fn();
    whole.on('update', seen);
    const real = new TextureSource({ width: 40, height: 20 });
    fill([whole, slice], real);
    expect(whole.source).toBe(real);
    expect([whole.width, whole.height]).toEqual([40, 20]);
    expect(seen).toHaveBeenCalled();
    expect([slice.width, slice.uvs.x0, slice.uvs.x1]).toEqual([10, 0.25, 0.5]);
    expect(slice.dynamic).toBe(true);
  });
});

describe('loadLate', () => {
  it('holds a run that may draw late art until a load works, trying again after a failure', async () => {
    vi.useFakeTimers();
    let tries = 0;
    const done = loadLate(async () => {
      if (++tries === 1) throw new Error('lost');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(lateArtReady()).toBe(false);
    expect(lateHold(run(LATE_FROM.wave))).toBe(true);
    expect(lateHold(run(1))).toBe(false);
    await vi.runAllTimersAsync();
    await done;
    await lateArt();
    expect(tries).toBe(2);
    expect(lateHold(run(LATE_FROM.wave))).toBe(false);
    vi.useRealTimers();
  });
});
