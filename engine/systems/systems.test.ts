import { describe, expect, it } from 'vitest';
import { BALL, BOSS, DEFAULT_RUN, DROPS, OVERFLOW_TIER, THREATS, type RunConfig } from '../config';
import type { SimEvent } from '../events';
import { toFp } from '../math/fixed';
import { body, createState, newElite, newPlayer, type SimState } from '../state';
import { bossSystem, newBoss } from './boss';
import { ballSystem, launchBall, nearestTarget } from './combat';
import { attractAll, dropGem, dropSystem, tierOf } from './drops';
import { stepHorde } from './horde';
import { threatSystem } from './threats';

/** A state with one player at the origin and nothing else. */
function bare(over: Partial<RunConfig> = {}): SimState {
  const s = createState({ ...DEFAULT_RUN, mobs: 0, elite: false, boss: false, ...over });
  s.players.push(newPlayer(0, 0, 0));
  return s;
}

const u = toFp;

describe('horde', () => {
  const P = { speed: u(10), stopDist: u(50), sep: u(40), queue: false };

  it('walks a lone mob toward the player at its speed, and stops short', () => {
    const s = bare();
    const mobs = [body(u(1000), 0)];
    stepHorde(mobs, s.players, P);
    expect(mobs[0]).toMatchObject({ x: u(990), y: 0, px: u(1000) });
    const close = [body(u(30), 0)];
    stepHorde(close, s.players, P);
    expect(close[0].x).toBe(u(30));
  });

  it('keeps a big crowd pressing on the player from collapsing', () => {
    const s = bare();
    const mobs = Array.from({ length: 300 }, (_, i) => body(Math.trunc(Math.cos(i) * u(300 + i)), Math.trunc(Math.sin(i) * u(300 + i))));
    for (let t = 0; t < 150; t++) stepHorde(mobs, s.players, { ...P, speed: u(3) });
    let closest = Infinity;
    for (let i = 0; i < mobs.length; i++) {
      for (let j = i + 1; j < mobs.length; j++) closest = Math.min(closest, Math.hypot(mobs[i].x - mobs[j].x, mobs[i].y - mobs[j].y));
    }
    expect(closest).toBeGreaterThan(P.sep * 0.5);
  });

  it('queues behind a neighbour ahead, but walks when the way is clear', () => {
    const s = bare();
    const mobs = [body(u(100), 0), body(u(135), 0), body(0, u(400))];
    stepHorde(mobs, s.players, { ...P, stopDist: u(10), sep: u(50), queue: true });
    expect(mobs[1].x).toBeGreaterThanOrEqual(u(135));
    expect(mobs[2].y).toBe(u(390));
  });
});

describe('balls', () => {
  it('hits, ricochets to the next target and stops after its bounces', () => {
    const s = bare();
    s.mobs.push(body(u(300), 0), body(u(300), u(400)), body(u(300), u(800)), body(u(300), u(1200)));
    const events: SimEvent[] = [];
    launchBall(s, 0, 0, 0, u(300), 0);
    for (let t = 0; t < 120 && s.balls.length > 0; t++) ballSystem(s, events);
    const hits = events.filter((e) => e.type === 'hit');
    expect(hits.length).toBe(BALL.maxHits);
    expect(events.filter((e) => e.type === 'mobDown').length).toBe(BALL.maxHits);
    expect(s.gems.length).toBe(BALL.maxHits);
  });

  it('drops dead after its travel without a hit', () => {
    const s = bare();
    launchBall(s, 0, 0, 0, u(100), 0);
    for (let t = 0; t < 30; t++) ballSystem(s, []);
    expect(s.balls.length).toBe(0);
  });

  it('numbers targets mobs, then the elite, then the boss', () => {
    const s = bare();
    s.mobs.push(body(u(500), 0));
    s.elite = newElite(u(50), 0);
    s.boss = newBoss(u(20), 0);
    expect(nearestTarget(s, 0, 0, u(1000))).toBe(2);
    s.boss.phase = 'down';
    expect(nearestTarget(s, 0, 0, u(1000))).toBe(1);
  });
});

describe('boss', () => {
  function run(s: SimState, ticks: number, hurt: number[] = []): string[] {
    const out: string[] = [];
    for (let t = 0; t < ticks; t++) {
      const ev: SimEvent[] = [];
      bossSystem(s, ev, (o) => hurt.push(o));
      out.push(...ev.map((e) => e.type));
    }
    return out;
  }

  it('walks up, then slams after its cooldown on a circle aimed at the player', () => {
    const s = bare();
    s.boss = newBoss(u(300), 0);
    expect(run(s, BOSS.cooldown - 1)).toEqual([]);
    expect(s.boss.x).toBe(BOSS.stopDist);
    const hurt: number[] = [];
    expect(run(s, BOSS.windup + 2, hurt)).toEqual(['bossWindup', 'bossSlam']);
    expect(hurt).toEqual([0]);
  });

  it('misses a player who stepped out of the circle', () => {
    const s = bare();
    s.boss = newBoss(u(300), 0);
    s.boss.cooldown = 0;
    run(s, 1);
    expect(s.boss.phase).toBe('windup');
    s.players[0].y = u(600);
    const hurt: number[] = [];
    expect(run(s, BOSS.windup + 1, hurt)).toContain('bossSlam');
    expect(hurt).toEqual([]);
  });

  it('comes back after lying down', () => {
    const s = bare();
    s.boss = newBoss(0, 0);
    s.boss.phase = 'down';
    expect(run(s, BOSS.respawnAfter)).toEqual(['bossBack']);
    expect(s.boss.hp).toBe(BOSS.hp);
    expect(Math.abs(Math.hypot(s.boss.x, s.boss.y) - BOSS.respawnDist)).toBeLessThan(u(3));
  });
});

describe('drops', () => {
  it('grows the look with the value', () => {
    expect([1, 9, 10, 49, 50, 500].map(tierOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('merges drops on one cell, and sends drops past the cap to one overflow gem', () => {
    const s = bare();
    for (let i = 0; i < 12; i++) dropGem(s, u(1205 + i * 5), u(1000), 1);
    expect(s.gems.length).toBe(1);
    expect(s.gems[0]).toMatchObject({ value: 12, tier: 1 });
    for (let i = 0; i < DROPS.max + 3; i++) dropGem(s, u(100 * i), u(5000), 2);
    expect(s.resting).toBe(DROPS.max);
    const o = s.gems.filter((g) => g.tier === OVERFLOW_TIER);
    expect(o.length).toBe(1);
    expect(o[0].value).toBe(8);
  });

  it('pulls gems in the magnet radius to the player and collects them', () => {
    const s = bare();
    dropGem(s, u(150), 0, 3);
    dropGem(s, u(600), 0, 5);
    const events: SimEvent[] = [];
    for (let t = 0; t < 30; t++) dropSystem(s, events);
    expect(s.players[0].xp).toBe(3);
    expect(s.gems.length).toBe(1);
    expect(events.filter((e) => e.type === 'pickup').length).toBe(1);
  });

  it('vacuums the whole map, and the cells start over', () => {
    const s = bare();
    for (let i = 0; i < 6; i++) dropGem(s, u(1000 + i * 300), 0, 1);
    attractAll(s, s.players[0]);
    for (let t = 0; t < 120; t++) dropSystem(s, []);
    expect(s.players[0].xp).toBe(6);
    expect(s.gems.length + s.resting).toBe(0);
    dropGem(s, u(1000), 0, 1);
    dropGem(s, u(1000), 0, 1);
    expect(s.gems.length).toBe(1);
  });
});

describe('threats', () => {
  it('fires a fan from a mob in range; the middle bullet hits a standing player', () => {
    const s = bare({ threats: true });
    s.mobs.push(body(u(400), 0));
    s.zoneT = 1e6;
    const hurt: number[] = [];
    threatSystem(s, [], (o) => hurt.push(o));
    expect(s.bullets.length).toBe(THREATS.fan);
    s.volleyT = 1e6;
    for (let t = 0; t < 40; t++) threatSystem(s, [], (o) => hurt.push(o));
    expect(hurt).toEqual([0]);
    expect(s.bullets.length).toBe(THREATS.fan - 1);
  });

  it('blasts a zone after the warning, hurting only players inside', () => {
    const s = bare({ threats: true });
    s.volleyT = 1e6;
    const hurt: number[] = [];
    const events: SimEvent[] = [];
    for (let t = 0; t < THREATS.warn + 1; t++) threatSystem(s, events, (o) => hurt.push(o));
    expect(events.map((e) => e.type)).toEqual(['blast']);
    const inside = THREATS.zoneSpread <= THREATS.zoneRadius || events.some((e) => e.type === 'blast' && Math.hypot(e.x, e.y) < e.radius);
    expect(hurt.length).toBe(inside ? 1 : 0);
  });
});
