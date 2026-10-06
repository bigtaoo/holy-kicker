import { describe, expect, it } from 'vitest';
import { BOSS, CARP, DEFAULT_RUN, EMERGE, EMPOWERED, HURT, SHOOTER, THREATS, TOAD_KING, WAVES, type RunConfig } from '../config';
import { Engine } from '../Engine';
import type { PlayerCommand } from '../input';
import { dist } from '../math/fixed';
import { newElite, newMob, underground, type Mob } from '../state';
import { bossIndex, downMob, targetAt } from './combat';
import { laneDistance } from './elite';
import { newBoss } from './boss';
import { beginWave, chapterBoss, eliteKinds, newcomer, waveFoeHp } from './waves';

// Chapter 2's mobs (docs/content.md "Chapters"): water ghosts that rise from a mark next to
// the hero, and toads that stop at range and spit bullet fans.

const MARSH: RunConfig = { ...DEFAULT_RUN, waves: 50, chapter: 2 };

function still(e: Engine): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
}

/** A marsh run with only the hero (not kicking) and mob `m`. */
function alone(m: Mob): Engine {
  const e = new Engine(MARSH);
  e.state.mobs = [m];
  e.state.players[0].kickCd = 1e6;
  return e;
}

describe('chapter mix', () => {
  it('brings toads and water ghosts into the marsh horde, foxes only into chapter 1', () => {
    const kinds = (chapter: number) => {
      const e = new Engine({ ...MARSH, chapter });
      for (let w = 2; w <= 20; w++) beginWave(e.state, w);
      return new Set(e.state.mobs.map((m) => m.kind));
    };
    expect([...kinds(1)].sort()).toEqual(['chaser', 'runner', 'swarm']);
    expect([...kinds(2)].sort()).toEqual(['chaser', 'emerger', 'shooter', 'swarm']);
    // chapters without their own list play the last one
    expect(newcomer(6, 30, 7)).toBe(newcomer(5, 30, 7));
    expect(newcomer(2, 1, 5)).toBe('chaser');
  });
});

describe('water ghost (emerger)', () => {
  it('waits under the ground, marks a spot next to the hero, then rises there and walks', () => {
    const m = newMob(3_000_000, 0, 50, 'emerger', EMERGE.warn + 5);
    const e = alone(m);
    const s = e.state;
    const p = s.players[0];
    expect(underground(m)).toBe(true);
    expect(targetAt(s, 0)).toBeNull();
    for (let i = 0; i < 5; i++) e.step([still(e)]);
    // on its mark: near the hero, still not there to hit
    const d = dist(m.x - p.x, m.y - p.y);
    expect(d).toBeGreaterThanOrEqual(EMERGE.near);
    expect(d).toBeLessThanOrEqual(EMERGE.far);
    const at = [m.x, m.y];
    const types: string[] = [];
    for (let i = 0; i < EMERGE.warn - 1; i++) types.push(...e.step([still(e)]).map((ev) => ev.type));
    expect([m.x, m.y]).toEqual(at);
    expect(types).not.toContain('emerge');
    expect(e.step([still(e)]).map((ev) => ev.type)).toContain('emerge');
    expect(targetAt(s, 0)).toBe(m);
    e.step([still(e)]);
    expect(dist(m.x - p.x, m.y - p.y)).toBeLessThan(d);
  });

  it('hurts a hero standing on its mark as it rises, and goes back under when it falls', () => {
    const m = newMob(0, 0, 50, 'emerger', EMERGE.warn + 1);
    const e = alone(m);
    const s = e.state;
    const p = s.players[0];
    e.step([still(e)]);
    p.x = m.x;
    p.y = m.y;
    let hurt = 0;
    for (let i = 0; i < EMERGE.warn; i++) for (const ev of e.step([still(e)])) if (ev.type === 'hurt') hurt += ev.value;
    expect(hurt).toBe(HURT.emerge);
    downMob(s, [], 0, p, true);
    expect(underground(m)).toBe(true);
    expect(m.t).toBeGreaterThan(EMERGE.under + EMERGE.warn - 1);
  });
});

describe('toad (shooter)', () => {
  it('stops at its range and spits a fan at the hero when its count runs out', () => {
    const m = newMob(700_000, 0, 50, 'shooter', SHOOTER.windup + 30);
    const e = alone(m);
    const s = e.state;
    const p = s.players[0];
    for (let i = 0; i < 29 + SHOOTER.windup; i++) e.step([still(e)]);
    expect(s.bullets.length).toBe(0);
    e.step([still(e)]);
    expect(s.bullets.length).toBe(THREATS.fan);
    expect(m.t).toBeGreaterThanOrEqual(SHOOTER.cooldown);
    for (let i = 0; i < 60; i++) e.step([still(e)]);
    expect(dist(m.x - p.x, m.y - p.y)).toBeGreaterThanOrEqual(SHOOTER.stopDist - 10_000);
    expect(dist(m.x - p.x, m.y - p.y)).toBeLessThan(SHOOTER.stopDist + 10_000);
  });

  it('does not start to swell while the hero is out of range, nor while stunned', () => {
    const m = newMob(3_000_000, 0, 50, 'shooter', SHOOTER.windup + 1);
    const e = alone(m);
    const s = e.state;
    // too far to walk into range this tick
    e.step([still(e)]);
    expect(m.t).toBe(SHOOTER.windup + 1);
    m.x = m.px = 600_000;
    m.stun = 10;
    e.step([still(e)]);
    expect(m.t).toBe(SHOOTER.windup + 1);
    m.stun = 0;
    for (let i = 0; i < SHOOTER.windup + 1; i++) e.step([still(e)]);
    expect(s.bullets.length).toBe(THREATS.fan);
  });
});

describe('toad king (elite)', () => {
  /** A marsh run with only the hero (not kicking) and a toad king `gap` to his right, ready. */
  function king(gap: number) {
    const e = new Engine(MARSH);
    const s = e.state;
    s.mobs.length = 0;
    const p = s.players[0];
    p.kickCd = 1e6;
    s.elites = [newElite(p.x + gap, p.y, 1, TOAD_KING.hp, 0, 'toadKing')];
    return { e, s, p, k: s.elites[0] };
  }

  it('comes on the marsh elite waves, with a big jiangshi along on the last one', () => {
    expect(eliteKinds(1, 10, 50)).toEqual(['charger']);
    expect(eliteKinds(2, 10, 50)).toEqual(['toadKing']);
    expect(eliteKinds(2, 40, 50)).toEqual(['toadKing']);
    expect(eliteKinds(2, 45, 50)).toEqual(['toadKing', 'charger']);
    const e = new Engine(MARSH);
    beginWave(e.state, WAVES.eliteEvery);
    expect(e.state.elites.map((x) => x.kind)).toEqual(['toadKing']);
  });

  it('swells, spits a wide fan, then marks poison pools on its next turn', () => {
    const { e, s, p, k } = king(TOAD_KING.stopDist);
    e.step([still(e)]);
    expect(k.phase).toBe('aim');
    // it marks no lane: the bot and the view leave the charge alone
    expect(laneDistance(k, p.x, p.y)).toBe(-1);
    for (let i = 0; i < TOAD_KING.windup; i++) e.step([still(e)]);
    expect(k.phase).toBe('rest');
    expect(s.bullets.length).toBe(TOAD_KING.fan);
    s.bullets.length = 0;
    for (let i = 0; i < TOAD_KING.rest + TOAD_KING.cooldown + TOAD_KING.windup + 2; i++) e.step([still(e)]);
    expect(s.bullets.length).toBe(0);
    expect(s.zones.length).toBe(TOAD_KING.pools);
    expect(s.zones[0]).toMatchObject({ x: p.x, y: p.y, radius: TOAD_KING.poolRadius });
  });

  it('hurts a hero who stays in a pool when it goes off', () => {
    const { e, s, k } = king(TOAD_KING.stopDist);
    k.shots = 1;
    let hurt = 0;
    for (let i = 0; i < TOAD_KING.windup + THREATS.warn + 2; i++) for (const ev of e.step([still(e)])) if (ev.type === 'hurt') hurt += ev.value;
    expect(s.zones.length).toBe(0);
    expect(hurt).toBe(HURT.pool);
  });

  it('walks in to its range, not to the hero, and waits with him out of range', () => {
    const { e, p, k } = king(3 * TOAD_KING.range);
    for (let i = 0; i < 30; i++) e.step([still(e)]);
    expect(k.phase).toBe('walk');
    for (let i = 0; i < 600 && k.phase === 'walk'; i++) e.step([still(e)]);
    const d = dist(k.x - p.x, k.y - p.y);
    expect(d).toBeLessThan(TOAD_KING.range);
    expect(d).toBeGreaterThan(TOAD_KING.stopDist - 20_000);
  });
});

describe('empowered abbot (mid-boss)', () => {
  it('comes on the marsh mid-boss wave in place of the twins, and the wave waits for it', () => {
    const e = new Engine(MARSH);
    const s = e.state;
    s.elites.length = 0;
    beginWave(s, WAVES.midBosses[0]);
    expect(s.elites.length).toBe(0);
    expect(s.boss).toMatchObject({ empowered: true, hp: waveFoeHp(EMPOWERED.hp, 2, WAVES.midBosses[0], false) });
    s.waveT = WAVES.ticks;
    e.step([still(e)]);
    expect(s.wave).toBe(WAVES.midBosses[0]);
    s.boss!.phase = 'down';
    s.boss!.t = 0;
    e.step([still(e)]);
    expect(s.wave).toBe(WAVES.midBosses[0] + 1);
    for (let i = 0; i < BOSS.respawnAfter + 1; i++) e.step([still(e)]);
    expect(s.boss).toBeNull();
  });

  it('sends a bullet ring out of every slam, and rests less', () => {
    const e = new Engine(MARSH);
    const s = e.state;
    s.mobs.length = 0;
    const p = s.players[0];
    p.kickCd = 1e6;
    s.boss = newBoss(p.x + BOSS.stopDist, p.y, EMPOWERED.hp, true);
    s.boss.cooldown = 0;
    for (let i = 0; i < BOSS.windup + 2 && s.boss.phase !== 'recover'; i++) e.step([still(e)]);
    expect(s.boss.phase).toBe('recover');
    expect(s.bullets.length).toBe(EMPOWERED.ring);
    for (let i = 0; i < BOSS.recover + 1; i++) e.step([still(e)]);
    expect(s.boss.cooldown).toBeLessThanOrEqual(EMPOWERED.cooldown);
    expect(s.boss.cooldown).toBeGreaterThan(EMPOWERED.cooldown - 3);
  });
});

describe('black carp king (boss)', () => {
  it('is the marsh boss, and later chapters keep it until they get their own', () => {
    expect([1, 2, 3, 4, 5, 6].map(chapterBoss)).toEqual(['abbot', 'carp', 'witch', 'judge', 'demon', 'demon']);
    const e = new Engine(MARSH);
    beginWave(e.state, MARSH.waves);
    expect(e.state.boss).toMatchObject({ kind: 'carp', empowered: false, hp: CARP.hp });
  });

  it('dives out of reach, locks a circle on the hero, and surfaces there with a ring', () => {
    const e = new Engine(MARSH);
    const s = e.state;
    s.mobs.length = 0;
    const p = s.players[0];
    p.kickCd = 1e6;
    s.boss = newBoss(p.x + CARP.stopDist, p.y, CARP.hp, false, 'carp');
    const b = s.boss;
    b.cooldown = 1;
    expect(e.step([still(e)]).map((ev) => ev.type)).toContain('bossDive');
    expect(targetAt(s, bossIndex(s))).toBeNull();
    let hurt = 0;
    const types: string[] = [];
    for (let i = 0; i < CARP.dive + CARP.rise + 2; i++) {
      for (const ev of e.step([still(e)])) {
        types.push(ev.type);
        if (ev.type === 'hurt') hurt += ev.value;
      }
    }
    expect(types.filter((x) => x === 'bossWindup').length).toBe(1);
    expect(types).toContain('bossSlam');
    expect(b.phase).toBe('recover');
    expect([b.x, b.y]).toEqual([p.x, p.y]);
    expect(hurt).toBe(HURT.surface);
    expect(s.bullets.length).toBe(CARP.ring);
    expect(targetAt(s, bossIndex(s))).toBe(b);
    for (let i = 0; i < CARP.recover; i++) e.step([still(e)]);
    expect(b.phase).toBe('walk');
    expect(b.cooldown).toBeLessThanOrEqual(CARP.cooldown);
    expect(b.cooldown).toBeGreaterThan(CARP.cooldown - 3);
  });
});
