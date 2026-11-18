import { describe, expect, it } from 'vitest';
import { ARENA, ARENA_GATES, arenaRun, gatePoint } from './arena';
import { Bot } from './bot/bot';
import { DEFAULT_RUN, VIEW, WAVES, type RunConfig } from './config';
import { Engine } from './Engine';
import { TICK_RATE, toFp } from './math/fixed';
import { body, type Body } from './state';
import { beginWave } from './systems/waves';

// The arena: an endless run inside walls, the horde coming in through gates (arena.ts).

const ARENA_RUN: RunConfig = { ...DEFAULT_RUN, seed: 11, waves: ARENA.waves, chapter: ARENA.chapter, revives: 0, arena: true };
const LIM = ARENA.half - ARENA.inset;
const inside = (b: Body) => Math.abs(b.x) <= LIM && Math.abs(b.y) <= LIM;
/** How far `b` is from the nearest gate's middle (Chebyshev). */
const gateGap = (b: Body) => Math.min(...ARENA_GATES.map((g) => Math.max(Math.abs(b.x - g.x), Math.abs(b.y - g.y))));
const NEAR_GATE = ARENA.inset + ARENA.gateDepth + ARENA.gateHalf;

describe('arena', () => {
  it('is only the runs that ask for it', () => {
    expect(arenaRun(ARENA_RUN)).toBe(true);
    expect(arenaRun({ ...DEFAULT_RUN, waves: 50 })).toBe(false);
  });

  it('has two gates on every wall', () => {
    expect(ARENA_GATES).toHaveLength(8);
    for (const g of ARENA_GATES) expect(Math.max(Math.abs(g.x), Math.abs(g.y))).toBe(ARENA.half);
  });

  it('opens with the first horde in the gates, none in sight', () => {
    const s = new Engine(ARENA_RUN).state;
    expect(s.mobs.length).toBeGreaterThan(0);
    for (const m of s.mobs) {
      expect(inside(m)).toBe(true);
      expect(gateGap(m)).toBeLessThanOrEqual(NEAR_GATE);
      expect(Math.abs(m.x) > VIEW.halfW || Math.abs(m.y) > VIEW.halfH).toBe(true);
    }
  });

  it('brings mobs in through a gate the hero does not see', () => {
    const s = new Engine(ARENA_RUN).state;
    const p = s.players[0];
    // the hero stands in the top left gate: nothing comes in there
    p.x = ARENA_GATES[0].x;
    p.y = ARENA_GATES[0].y + toFp(200);
    for (let i = 0; i < 300; i++) {
      const b = body(0, 0);
      gatePoint(s, b);
      expect(inside(b)).toBe(true);
      expect(Math.abs(b.x - p.x) <= VIEW.halfW && Math.abs(b.y - p.y) <= VIEW.halfH).toBe(false);
    }
  });

  it('brings both mid-boss twins in through gates, even with the hero at a wall', () => {
    const e = new Engine(ARENA_RUN);
    const s = e.state;
    s.players[0].x = LIM;
    s.players[0].y = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      s.ai.int(seed);
      s.elites.length = 0;
      beginWave(s, WAVES.midBosses[0]);
      expect(s.elites).toHaveLength(2);
      for (const el of s.elites) expect(gateGap(el)).toBeLessThanOrEqual(NEAR_GATE);
    }
  });

  it('keeps the hero, the horde and the elites inside the walls all run long', () => {
    const e = new Engine(ARENA_RUN);
    const s = e.state;
    const bot = new Bot(0, 'straight', 11);
    let maxWave = 0;
    while (s.outcome === 'playing' && s.tick < 4 * 60 * TICK_RATE) {
      e.step([bot.command(s)]);
      for (const p of s.players) expect(inside(p)).toBe(true);
      for (const m of s.mobs) expect(inside(m)).toBe(true);
      for (const el of s.elites) expect(inside(el)).toBe(true);
      if (s.boss) expect(inside(s.boss)).toBe(true);
      maxWave = Math.max(maxWave, s.wave);
    }
    // the bot ran into the walls and still played on through the waves
    expect(maxWave).toBeGreaterThan(5);
    expect(s.outcome).not.toBe('won');
  });

  it('holds a hero who keeps running at a wall', () => {
    const e = new Engine(ARENA_RUN);
    const s = e.state;
    for (let t = 0; t < 10 * TICK_RATE && s.outcome === 'playing'; t++) e.step([{ owner: 0, tick: s.tick + 1, moveBrad: 0, moveMag: 255, pick: 0 }]);
    expect(s.players[0].x).toBe(LIM);
  });
});
