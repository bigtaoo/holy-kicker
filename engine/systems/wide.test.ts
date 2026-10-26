import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, VIEW, VIEW_WIDE, WAVES, WIDE_RING, type RunConfig } from '../config';
import { Engine } from '../Engine';
import { toFp } from '../math/fixed';
import { Prng } from '../math/prng';
import { body, newPlayer } from '../state';
import { inView, respawnPoint, spawnPoint } from './horde';

// A landscape screen's run (RunConfig.wide): a wider view, and the horde coming in from past it.

const WIDE: RunConfig = { ...DEFAULT_RUN, waves: 50, wide: true };
const TALL: RunConfig = { ...DEFAULT_RUN, waves: 50 };

/** Whether (x, y) lies outside the widest landscape screen (2133x1200) around the origin. */
const offWideScreen = (x: number, y: number) => Math.abs(x) > toFp(1067) || Math.abs(y) > toFp(600);

describe('wide run', () => {
  it('sees a big one at the side of the screen that a portrait run does not', () => {
    const x = VIEW.halfW + toFp(200);
    expect(x).toBeLessThan(VIEW_WIDE.halfW);
    const wide = new Engine(WIDE).state;
    const tall = new Engine(TALL).state;
    expect(inView(wide, wide.players[0], x, 0)).toBe(true);
    expect(inView(tall, tall.players[0], x, 0)).toBe(false);
    expect(inView(wide, wide.players[0], 0, VIEW_WIDE.halfH + toFp(100))).toBe(false);
  });

  it('brings new and returning mobs in from off the screen on every side', () => {
    const s = new Engine(WIDE).state;
    const p = newPlayer(0, 0, 0);
    const m = body(0, 0);
    const rand = new Prng(3);
    let left = 0;
    let top = 0;
    for (let i = 0; i < 400; i++) {
      spawnPoint(s, 0, 0, m);
      expect(offWideScreen(m.x, m.y)).toBe(true);
      respawnPoint(rand, p, m, false, true);
      expect(offWideScreen(m.x, m.y)).toBe(true);
      expect(Math.hypot(m.x, m.y)).toBeLessThanOrEqual(Math.hypot(WIDE_RING.halfW, WIDE_RING.halfH) + WIDE_RING.depth + toFp(1));
      if (m.x < -toFp(1067)) left++;
      if (m.y < -toFp(600)) top++;
    }
    expect(left).toBeGreaterThan(40);
    expect(top).toBeGreaterThan(40);
  });

  it('brings the opening crowd back just past the screen', () => {
    const p = newPlayer(0, 0, 0);
    const m = body(0, 0);
    const rand = new Prng(5);
    for (let i = 0; i < 200; i++) {
      respawnPoint(rand, p, m, true, true);
      expect(offWideScreen(m.x, m.y)).toBe(true);
      expect(Math.abs(m.x) <= WIDE_RING.backW + WAVES.openingBackDepth && Math.abs(m.y) <= WIDE_RING.backH + WAVES.openingBackDepth).toBe(true);
    }
  });

  it('plays a chapter the same way twice', () => {
    const a = new Engine(WIDE);
    const b = new Engine(WIDE);
    for (let i = 0; i < 900; i++) {
      a.step([]);
      b.step([]);
    }
    expect(a.state.mobs.map((m) => m.x)).toEqual(b.state.mobs.map((m) => m.x));
  });
});
