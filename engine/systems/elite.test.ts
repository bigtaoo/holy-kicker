import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, ELITE, HURT, MIX, MOB_KINDS, type RunConfig } from '../config';
import { Engine } from '../Engine';
import type { PlayerCommand } from '../input';
import { dist } from '../math/fixed';
import { newElite } from '../state';
import { DASH_TICKS, laneDistance } from './elite';
import { beginWave, hordeSize, isSwarmWave, mobHp } from './waves';

// The chapter's enemy kinds (docs/content.md "Enemies"): chasers, runners and swarm packs in
// the horde, and the elite that charges along a marked lane.

const CHAPTER: RunConfig = { ...DEFAULT_RUN, waves: 50 };

function still(e: Engine): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
}

/** A chapter with only the hero (not kicking) and an elite `gap` to his right, its charge ready. */
function duel(gap: number): Engine {
  const e = new Engine(CHAPTER);
  const s = e.state;
  s.mobs.length = 0;
  const p = s.players[0];
  s.elites = [newElite(p.x + gap, p.y)];
  s.elites[0].cd = 0;
  // the hero does not kick, so nothing knocks the elite off its lane
  p.kickCd = 1e6;
  return e;
}

describe('horde mix', () => {
  it('brings runners in from their wave and swarm packs on swarm waves', () => {
    const e = new Engine(CHAPTER);
    const s = e.state;
    const count = (k: string) => s.mobs.filter((m) => m.kind === k).length;
    expect(count('chaser')).toBe(hordeSize(1));
    for (let w = 2; w <= MIX.swarmFrom; w++) beginWave(s, w);
    expect(count('runner')).toBeGreaterThan(0);
    expect(count('chaser') + count('runner')).toBe(hordeSize(MIX.swarmFrom));
    expect(count('swarm')).toBe(MIX.swarmPack);
    // the pack arrives bunched
    const pack = s.mobs.filter((m) => m.kind === 'swarm');
    for (const m of pack) expect(dist(m.x - pack[0].x, m.y - pack[0].y)).toBeLessThanOrEqual(MIX.swarmSpread * 3);
    for (let w = MIX.swarmFrom + 1; w <= 50; w++) beginWave(s, w);
    expect(count('swarm')).toBe(MIX.swarmMax);
    expect(isSwarmWave(50, 50)).toBe(false);
  });

  it('gives each kind its share of the wave health; a swarm mob always falls to one hit', () => {
    expect(mobHp(30, 'runner')).toBe(Math.trunc((mobHp(30) * MOB_KINDS.runner.hpPercent) / 100));
    expect(mobHp(50, 'swarm')).toBe(1);
    expect(MOB_KINDS.runner.speed).toBeGreaterThan(MOB_KINDS.chaser.speed);
  });
});

describe('charging elite', () => {
  it('marks a lane at the hero, dashes along it and hurts him if he stays', () => {
    const e = duel(600_000);
    const s = e.state;
    const p = s.players[0];
    e.step([still(e)]);
    expect(s.elites[0].phase).toBe('aim');
    // the lane runs through the hero
    expect(laneDistance(s.elites[0], p.x, p.y)).toBeLessThan(1000);
    const x0 = s.elites[0].x;
    for (let i = 0; i < ELITE.aim; i++) e.step([still(e)]);
    expect(s.elites[0].phase).toBe('dash');
    expect(s.elites[0].x).toBe(x0);
    let hurt = 0;
    for (let i = 0; i < DASH_TICKS; i++) for (const ev of e.step([still(e)])) if (ev.type === 'hurt') hurt += ev.value;
    expect(hurt).toBe(HURT.charge);
    expect(s.elites[0].phase).toBe('rest');
    expect(x0 - s.elites[0].x).toBeGreaterThanOrEqual(ELITE.dashLength);
  });

  it('misses a hero who stepped out of the lane, and rests before walking again', () => {
    const e = duel(600_000);
    const s = e.state;
    const p = s.players[0];
    e.step([still(e)]);
    p.y += 400_000;
    expect(laneDistance(s.elites[0], p.x, p.y)).toBeGreaterThan(ELITE.laneHalf);
    let hurt = 0;
    for (let i = 0; i < ELITE.aim + DASH_TICKS + ELITE.rest; i++) for (const ev of e.step([still(e)])) if (ev.type === 'hurt') hurt++;
    expect(hurt).toBe(0);
    expect(s.elites[0].phase).toBe('walk');
    expect(s.elites[0].cd).toBe(ELITE.cooldown);
    expect(laneDistance(s.elites[0], p.x, p.y)).toBe(-1);
  });

  it('takes turns with a twin: one aims only while the other is not charging', () => {
    const e = duel(600_000);
    const s = e.state;
    const p = s.players[0];
    s.elites.push(newElite(p.x - 600_000, p.y, 2));
    s.elites[1].cd = 0;
    e.step([still(e)]);
    expect(s.elites.map((x) => x.phase)).toEqual(['aim', 'walk']);
    for (let i = 0; i < ELITE.aim + DASH_TICKS - 1; i++) {
      e.step([still(e)]);
      expect(s.elites[1].phase).toBe('walk');
    }
    // the first is back to rest on the tick the second starts aiming
    e.step([still(e)]);
    expect(s.elites.map((x) => x.phase)).toEqual(['rest', 'aim']);
  });

  it('walks in while the hero is out of reach or the charge is cooling down', () => {
    const e = duel(ELITE.chargeRange + 300_000);
    const s = e.state;
    const x0 = s.elites[0].x;
    e.step([still(e)]);
    expect(s.elites[0].phase).toBe('walk');
    expect(s.elites[0].x).toBeLessThan(x0);
  });
});
