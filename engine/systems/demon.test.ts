import { describe, expect, it } from 'vitest';
import { CHAPTER_PACKS, DEFAULT_RUN, DEMON, EMPOWERED_JUDGE, MONK, THREATS, type RunConfig } from '../config';
import type { RelicId } from '../content';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import type { PlayerCommand } from '../input';
import { dist } from '../math/fixed';
import { newMob, type Mob } from '../state';
import { newBoss } from './boss';
import { damage } from './combat';
import { demonRage } from './demon';
import { resetMob } from './marsh';
import { beginWave, eliteKinds, hordeSize } from './waves';

// Chapter 5, Demon Peak (docs/content.md "Chapters"): fallen monks behind gongs (shielders),
// shadows (runners) and every earlier kind, wolf packs, two elites at once, the empowered
// Underworld Judge as mid-boss and the Inner Demon, who turns the hero's relic against him.

const PEAK: RunConfig = { ...DEFAULT_RUN, waves: 50, chapter: 5 };

function still(e: Engine): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
}

/** A demon peak run with only the hero (not kicking) and the mobs `ms`. */
function alone(...ms: Mob[]): Engine {
  const e = new Engine(PEAK);
  e.state.mobs = ms;
  e.state.players[0].kickCd = 1e6;
  return e;
}

function steps(e: Engine, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...e.step([still(e)]));
  return events;
}

describe('demon peak horde', () => {
  it('brings fallen monks, shadows and every earlier kind, and wolves in packs on top', () => {
    const e = new Engine(PEAK);
    const s = e.state;
    const count = (k: string) => s.mobs.filter((m) => m.kind === k).length;
    for (let w = 2; w <= 20; w++) beginWave(s, w);
    for (const k of ['monk', 'runner', 'shooter', 'caster', 'effigy', 'emerger', 'chaser']) expect(count(k)).toBeGreaterThan(0);
    const horde = ['chaser', 'monk', 'runner', 'shooter', 'caster', 'effigy', 'emerger'].reduce((n, k) => n + count(k), 0);
    expect(horde).toBe(hordeSize(20));
    expect(count('wolf')).toBeGreaterThan(0);
    expect(CHAPTER_PACKS[4].kind).toBe('wolf');
  });

  it("a fallen monk's gong takes relic hits from its hero's side until it cracks; spells always land", () => {
    const e = alone();
    const s = e.state;
    const p = s.players[0];
    const m = newMob(p.x + 200_000, p.y, 1000, 'monk');
    resetMob(s, m);
    s.mobs = [m];
    const events: SimEvent[] = [];
    // from behind it lands
    damage(s, events, 0, p, null, 100, true, { x: m.x + 100_000, y: m.y });
    expect(m.hp).toBeLessThan(1000);
    const hp = m.hp;
    // a spell lands
    damage(s, events, 0, p, null);
    expect(m.hp).toBeLessThan(hp);
    // from the hero's side the gong takes MONK.blocks hits, then it cracks
    events.length = 0;
    const hpFront = m.hp;
    for (let k = 0; k < MONK.blocks; k++) damage(s, events, 0, p, null, 100, true, p);
    expect(events.filter((x) => x.type === 'block')).toHaveLength(MONK.blocks);
    expect(m.hp).toBe(hpFront);
    damage(s, events, 0, p, null, 100, true, p);
    expect(m.hp).toBeLessThan(hpFront);
  });
});

describe('two elites at once', () => {
  it('every elite wave brings a pair of earlier elites, in turn', () => {
    expect(eliteKinds(5, 10, 50)).toEqual(['charger', 'toadKing']);
    expect(eliteKinds(5, 20, 50)).toEqual(['wolfLeader', 'toadKing']);
    expect(eliteKinds(5, 30, 50)).toEqual(['doorGod', 'charger']);
    expect(eliteKinds(5, 40, 50)).toEqual(['doorGod', 'wolfLeader']);
    const e = new Engine(PEAK);
    beginWave(e.state, 10);
    expect(e.state.elites.map((x) => x.kind)).toEqual(['charger', 'toadKing']);
  });

  it('the mid-boss is the empowered judge, the last boss the Inner Demon', () => {
    const e = new Engine(PEAK);
    beginWave(e.state, 25);
    expect(e.state.boss).toMatchObject({ kind: 'judge', empowered: true, hp: EMPOWERED_JUDGE.hp });
    e.state.boss = null;
    beginWave(e.state, 50);
    expect(e.state.boss).toMatchObject({ kind: 'demon', empowered: false, hp: DEMON.hp });
  });
});

describe('inner demon (boss)', () => {
  function demon(relic: RelicId) {
    const e = alone();
    const s = e.state;
    const p = s.players[0];
    p.relicId = relic;
    s.boss = newBoss(p.x + DEMON.stopDist, p.y, DEMON.hp, false, 'demon');
    s.boss.cooldown = 1;
    return { e, s, p, b: s.boss };
  }

  it('keeps its distance, circling the hero', () => {
    const { e, p, b } = demon('ball');
    b.cooldown = 1e6;
    const y0 = b.y;
    steps(e, 30);
    expect(Math.abs(dist(b.x - p.x, b.y - p.y) - DEMON.stopDist)).toBeLessThan(60_000);
    expect(b.y).not.toBe(y0);
  });

  it('kicks volleys of the ball back at a ball player', () => {
    const { e, s } = demon('ball');
    expect(steps(e, 1).map((x) => x.type)).toContain('bossWindup');
    expect(steps(e, DEMON.windup).map((x) => x.type)).toContain('bossCast');
    expect(s.bullets.length).toBe(DEMON.ballFan);
    steps(e, DEMON.volleyGap * DEMON.volleys);
    expect(s.bullets.length).toBe(DEMON.ballFan * DEMON.volleys);
  });

  it('sends rings like the wooden fish, spirals like the beads and a wide fan like the bowl', () => {
    for (const [relic, n] of [['fish', DEMON.waves * DEMON.waveRing], ['beads', DEMON.spiral * DEMON.spiralRing], ['bowl', DEMON.bowlFan]] as const) {
      const { e, s, p } = demon(relic);
      steps(e, 1 + DEMON.windup);
      // out of the way, so no bullet meets him
      p.x += 5_000_000;
      steps(e, DEMON.recover - 1);
      expect(s.bullets.length).toBe(n);
    }
  });

  it('leaps onto a staff player, landing as its circle goes off', () => {
    const { e, s, p, b } = demon('staff');
    p.hurtCd = 1e6;
    steps(e, 1 + DEMON.windup);
    expect(s.zones).toHaveLength(1);
    expect(s.zones[0]).toMatchObject({ x: p.x, y: p.y, radius: DEMON.leapRadius });
    const events = steps(e, THREATS.warn);
    expect(events.map((x) => x.type)).toContain('blast');
    expect(events.map((x) => x.type)).toContain('bossSlam');
    expect(dist(b.x - p.x, b.y - p.y)).toBeLessThan(5_000);
    expect(s.bullets.length).toBe(DEMON.leapRing);
  });

  it('then casts a dark spell of zones around the hero, and rests less below half its health', () => {
    const { e, s, p, b } = demon('ball');
    b.shots = 1;
    steps(e, 1 + DEMON.windup);
    expect(s.zones).toHaveLength(DEMON.spell);
    expect(s.zones.some((z) => z.x === p.x && z.y === p.y)).toBe(true);
    expect(s.bullets).toHaveLength(0);
    b.hp = Math.trunc((DEMON.hp * DEMON.ragePercent) / 100);
    expect(demonRage(b)).toBe(true);
    steps(e, DEMON.recover);
    expect(b.cooldown).toBe(DEMON.rageCooldown);
  });
});
