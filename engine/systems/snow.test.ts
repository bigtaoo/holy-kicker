import { describe, expect, it } from 'vitest';
import { CASTER, CHAPTER_PACKS, DEFAULT_RUN, ELITE, EMPOWERED_CARP, HURT, MOB_KINDS, THREATS, WITCH, WOLF_LEADER, type RunConfig } from '../config';
import { Engine } from '../Engine';
import type { PlayerCommand } from '../input';
import { dist } from '../math/fixed';
import { newElite, newMob, underground, type Mob } from '../state';
import { downMob, targetAt } from './combat';
import { newBoss } from './boss';
import { beginWave, chapterBoss, eliteKinds, hordeSize, isPackWave } from './waves';

// Chapter 3, the Snow Pass (docs/content.md "Chapters"): ice wraiths that mark frost circles,
// wolf packs, the howling wolf leader, the empowered carp as mid-boss and the Bone Witch, whose
// skeletons split into shards when they fall.

const SNOW: RunConfig = { ...DEFAULT_RUN, waves: 50, chapter: 3 };

function still(e: Engine): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
}

/** A snow run with only the hero (not kicking) and the mobs `ms`. */
function alone(...ms: Mob[]): Engine {
  const e = new Engine(SNOW);
  e.state.mobs = ms;
  e.state.players[0].kickCd = 1e6;
  return e;
}

function steps(e: Engine, n: number): string[] {
  const types: string[] = [];
  for (let i = 0; i < n; i++) types.push(...e.step([still(e)]).map((ev) => ev.type));
  return types;
}

describe('snow horde', () => {
  it('brings ice wraiths into the horde and wolves in packs on top of it', () => {
    const e = new Engine(SNOW);
    const s = e.state;
    const count = (k: string) => s.mobs.filter((m) => m.kind === k).length;
    const pack = CHAPTER_PACKS[2];
    for (let w = 2; w <= 20; w++) beginWave(s, w);
    expect(count('caster')).toBeGreaterThan(0);
    expect(count('runner') + count('swarm') + count('emerger') + count('shooter')).toBe(0);
    // the wolves do not count toward the horde size
    expect(count('chaser') + count('caster')).toBe(hordeSize(20));
    const packs = Array.from({ length: 19 }, (_, i) => i + 2).filter((w) => isPackWave(3, w, 50)).length;
    expect(count('wolf')).toBe(Math.min(pack.max, packs * pack.size));
    for (let w = 21; w <= 49; w++) beginWave(s, w);
    expect(count('wolf')).toBe(pack.max);
    expect(MOB_KINDS.wolf.speed).toBeGreaterThan(MOB_KINDS.runner.speed);
  });
});

describe('ice wraith (caster)', () => {
  it('stops at range and marks a frost circle on the hero, which goes off after the warning', () => {
    const e = alone(newMob(2_000_000, 0, 50, 'caster', 1000));
    const s = e.state;
    const p = s.players[0];
    const m = s.mobs[0];
    for (let i = 0; i < 600; i++) e.step([still(e)]);
    expect(s.zones.length).toBe(0);
    // walked in to its range, and no closer
    expect(dist(m.x - p.x, m.y - p.y)).toBeGreaterThanOrEqual(CASTER.stopDist - 10_000);
    expect(dist(m.x - p.x, m.y - p.y)).toBeLessThan(CASTER.stopDist + 10_000);
    m.t = 2;
    steps(e, 2);
    expect(s.zones).toHaveLength(1);
    expect(s.zones[0]).toMatchObject({ x: p.x, y: p.y, radius: CASTER.radius, hurt: HURT.frost });
    expect(m.t).toBeGreaterThanOrEqual(CASTER.cooldown);
    let hurt = 0;
    for (let i = 0; i < THREATS.warn; i++) for (const ev of e.step([still(e)])) if (ev.type === 'hurt') hurt += ev.value;
    expect(hurt).toBe(HURT.frost);
  });

  it('waits to raise its arms until the hero is in range', () => {
    const e = alone(newMob(5_000_000, 0, 50, 'caster', CASTER.windup + 1));
    const m = e.state.mobs[0];
    e.state.players[0].moveMag = 0;
    // far away: walking in, the count holds
    e.step([still(e)]);
    expect(m.t).toBe(CASTER.windup + 1);
  });
});

describe('wolf leader (elite)', () => {
  it("is chapter 3's elite, with the toad king along on wave 40", () => {
    expect(eliteKinds(3, 10, 50)).toEqual(['wolfLeader']);
    expect(eliteKinds(3, 40, 50)).toEqual(['wolfLeader', 'toadKing']);
    const e = new Engine(SNOW);
    beginWave(e.state, 10);
    expect(e.state.elites[0]).toMatchObject({ kind: 'wolfLeader', hp: WOLF_LEADER.hp });
  });

  it('charges, then howls: the mobs near it run fast for a while', () => {
    const near = newMob(400_000, 300_000, 50);
    const far = newMob(-1_500_000, 0, 50);
    const e = alone(near, far);
    const s = e.state;
    const p = s.players[0];
    const w = newElite(p.x + 600_000, p.y, 1, WOLF_LEADER.hp, 0, 'wolfLeader');
    s.elites = [w];
    e.step([still(e)]);
    expect(w.phase).toBe('aim');
    steps(e, ELITE.aim + 40);
    // the next attack is a howl
    w.cd = 0;
    w.phase = 'walk';
    w.x = p.x + 600_000;
    w.y = p.y;
    e.step([still(e)]);
    expect(w.phase).toBe('howl');
    expect(steps(e, WOLF_LEADER.howl)).toContain('howl');
    expect(near.haste).toBeGreaterThan(0);
    expect(far.haste).toBe(0);
    // hasted, it covers more ground in a tick than the one far away
    const [nx, ny, fx, fy] = [near.x, near.y, far.x, far.y];
    e.step([still(e)]);
    expect(dist(near.x - nx, near.y - ny)).toBeGreaterThan(dist(far.x - fx, far.y - fy));
    steps(e, WOLF_LEADER.haste);
    expect(near.haste).toBe(0);
  });
});

describe('mid-boss and boss', () => {
  it('brings the empowered carp on wave 25 and the Bone Witch on wave 50', () => {
    expect(chapterBoss(3)).toBe('witch');
    const e = new Engine(SNOW);
    beginWave(e.state, 25);
    expect(e.state.boss).toMatchObject({ kind: 'carp', empowered: true, hp: EMPOWERED_CARP.hp });
    e.state.boss = null;
    beginWave(e.state, 50);
    expect(e.state.boss).toMatchObject({ kind: 'witch', empowered: false, hp: WITCH.hp });
  });

  it('the empowered carp surfaces with a fuller ring', () => {
    const e = alone();
    const s = e.state;
    const p = s.players[0];
    s.boss = newBoss(p.x + 100_000, p.y, EMPOWERED_CARP.hp, true, 'carp');
    s.boss.cooldown = 1;
    const types = steps(e, 80);
    expect(types).toContain('bossSlam');
    expect(s.bullets.length).toBe(EMPOWERED_CARP.ring);
  });
});

describe('bone witch (boss)', () => {
  it('summons skeletons around her and throws a bone fan, in turn', () => {
    const e = alone();
    const s = e.state;
    const p = s.players[0];
    s.boss = newBoss(p.x + WITCH.stopDist, p.y, WITCH.hp, false, 'witch');
    const b = s.boss;
    b.cooldown = 1;
    expect(steps(e, 1)).toContain('bossWindup');
    const types = steps(e, WITCH.windup + 1);
    expect(types.filter((t) => t === 'summon')).toHaveLength(WITCH.summon);
    expect(types).toContain('bossCast');
    const skel = s.mobs.filter((m) => m.kind === 'skeleton');
    expect(skel).toHaveLength(WITCH.summon);
    for (const m of skel) {
      expect(dist(m.x - b.x, m.y - b.y)).toBeLessThanOrEqual(WITCH.far + 10_000);
      expect(underground(m)).toBe(false);
    }
    b.cooldown = 1;
    b.phase = 'walk';
    steps(e, WITCH.windup + 2);
    expect(s.bullets.length).toBe(WITCH.fan);
  });

  it('a skeleton splits into shards, and fallen ones lie under the ground until summoned again', () => {
    const e = alone(newMob(1_000_000, 0, 30, 'skeleton'));
    const s = e.state;
    const p = s.players[0];
    downMob(s, [], 0, p, true);
    expect(s.mobs[0].hp).toBe(0);
    expect(targetAt(s, 0)).toBeNull();
    // the shards join at the end of the tick
    expect(s.mobs).toHaveLength(1);
    e.step([still(e)]);
    const shards = s.mobs.filter((m) => m.kind === 'shard' && !underground(m));
    expect(shards).toHaveLength(WITCH.shards);
    for (const m of shards) expect(dist(m.x - 1_000_000, m.y)).toBeLessThanOrEqual(WITCH.shardSpread + 20_000);
    // a shard falls for good and does not split
    downMob(s, [], 1, p, false);
    e.step([still(e)]);
    expect(s.mobs.filter((m) => !underground(m))).toHaveLength(WITCH.shards - 1);
    // the next summons brings the fallen skeleton back instead of adding one
    s.spawns.push({ kind: 'skeleton', x: 0, y: 500_000 });
    e.step([still(e)]);
    expect(s.mobs).toHaveLength(1 + WITCH.shards);
    expect(underground(s.mobs[0])).toBe(false);
  });

  it('stops summoning at her cap and throws instead', () => {
    const e = alone(...Array.from({ length: WITCH.maxSkeletons }, (_, i) => newMob(4_000_000, i * 100_000, 30, 'skeleton')));
    const s = e.state;
    const p = s.players[0];
    s.boss = newBoss(p.x + WITCH.stopDist, p.y, WITCH.hp, false, 'witch');
    s.boss.cooldown = 1;
    const types = steps(e, WITCH.windup + 2);
    expect(types).not.toContain('summon');
    expect(s.bullets.length).toBe(WITCH.fan);
  });
});
