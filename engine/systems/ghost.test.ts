import { describe, expect, it } from 'vitest';
import { CHAPTER_PACKS, DEFAULT_RUN, DOOR_GOD, EFFIGY, EMPOWERED_WITCH, HURT, JUDGE, THREATS, type RunConfig } from '../config';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import type { PlayerCommand } from '../input';
import { dist } from '../math/fixed';
import { TRIG_ONE } from '../math/trig';
import { newElite, newMob, underground, type Mob } from '../state';
import { newBoss } from './boss';
import { damage, downMob, eliteIndex } from './combat';
import { shielded } from './ghost';
import { enraged } from './judge';
import { chapterHurt } from './players';
import { beginWave, chapterBoss, eliteKinds, hordeSize } from './waves';

// Chapter 4, the Ghost Market (docs/content.md "Chapters"): lantern ghosts (shooters),
// long-tongue ghosts (emergers) and paper effigies that tear into scraps, wisp packs, the
// shielded door god, the empowered Bone Witch as mid-boss and the Underworld Judge.

const GHOST: RunConfig = { ...DEFAULT_RUN, waves: 50, chapter: 4 };

function still(e: Engine): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
}

/** A ghost market run with only the hero (not kicking) and the mobs `ms`. */
function alone(...ms: Mob[]): Engine {
  const e = new Engine(GHOST);
  e.state.mobs = ms;
  e.state.players[0].kickCd = 1e6;
  return e;
}

function steps(e: Engine, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...e.step([still(e)]));
  return events;
}

describe('ghost market horde', () => {
  it('brings lantern ghosts, long-tongue ghosts and effigies, and wisps in packs on top', () => {
    const e = new Engine(GHOST);
    const s = e.state;
    const count = (k: string) => s.mobs.filter((m) => m.kind === k).length;
    for (let w = 2; w <= 20; w++) beginWave(s, w);
    for (const k of ['shooter', 'emerger', 'effigy']) expect(count(k)).toBeGreaterThan(0);
    expect(count('runner') + count('caster') + count('wolf')).toBe(0);
    expect(count('chaser') + count('shooter') + count('emerger') + count('effigy')).toBe(hordeSize(20));
    expect(count('swarm')).toBeGreaterThan(0);
    expect(CHAPTER_PACKS[3].kind).toBe('swarm');
  });

  it('an effigy tears into scraps that fall for good, up to a cap', () => {
    const e = alone(newMob(1_000_000, 0, 30, 'effigy'));
    const s = e.state;
    const p = s.players[0];
    downMob(s, [], 0, p, true);
    // the effigy itself comes back on the ring
    expect(s.mobs[0].hp).toBeGreaterThan(0);
    e.step([still(e)]);
    const scraps = s.mobs.filter((m) => m.kind === 'scrap' && !underground(m));
    expect(scraps).toHaveLength(EFFIGY.scraps);
    for (const m of scraps) expect(dist(m.x - 1_000_000, m.y)).toBeLessThanOrEqual(EFFIGY.spread + 20_000);
    downMob(s, [], 1, p, false);
    e.step([still(e)]);
    expect(s.mobs.filter((m) => m.kind === 'scrap' && !underground(m))).toHaveLength(EFFIGY.scraps - 1);
    // no more scraps than the cap stand at once
    for (let k = 0; k < EFFIGY.maxScraps; k++) {
      downMob(s, [], 0, p, true);
      e.step([still(e)]);
    }
    expect(s.mobs.filter((m) => m.kind === 'scrap' && !underground(m))).toHaveLength(EFFIGY.maxScraps);
  });
});

describe('door god (elite)', () => {
  it("is chapter 4's elite, with the wolf leader along on wave 40", () => {
    expect(eliteKinds(4, 10, 50)).toEqual(['doorGod']);
    expect(eliteKinds(4, 40, 50)).toEqual(['doorGod', 'wolfLeader']);
    const e = new Engine(GHOST);
    beginWave(e.state, 10);
    expect(e.state.elites[0]).toMatchObject({ kind: 'doorGod', hp: DOOR_GOD.hp });
  });

  it('its shield takes relic hits from the front, not from behind, and never spells', () => {
    const e = alone();
    const s = e.state;
    const p = s.players[0];
    const g = newElite(p.x + 300_000, p.y, 1, DOOR_GOD.hp, 1000, 'doorGod');
    s.elites = [g];
    e.step([still(e)]);
    // it turned to face the hero, on its left
    expect(g.vx).toBeLessThan(0);
    expect(shielded(g, p.x, p.y)).toBe(true);
    expect(shielded(g, g.x + 300_000, g.y)).toBe(false);
    const i = eliteIndex(s);
    const ev: SimEvent[] = [];
    damage(s, ev, i, p, null, 100, false, p);
    expect(ev.map((x) => x.type)).toEqual(['block']);
    expect(g.hp).toBe(DOOR_GOD.hp);
    damage(s, ev, i, p, null, 100, false, { x: g.x + 300_000, y: g.y });
    expect(g.hp).toBeLessThan(DOOR_GOD.hp);
    const hp = g.hp;
    // a spell gives no source
    damage(s, ev, i, p, null, 100);
    expect(g.hp).toBeLessThan(hp);
  });

  it('turns slowly, so a hero going round it gets behind its shield', () => {
    const e = alone();
    const s = e.state;
    const p = s.players[0];
    const g = newElite(p.x + 300_000, p.y, 1, DOOR_GOD.hp, 1000, 'doorGod');
    s.elites = [g];
    e.step([still(e)]);
    // the hero is suddenly behind it
    p.x = g.x + 300_000;
    p.px = p.x;
    e.step([still(e)]);
    expect(shielded(g, p.x, p.y)).toBe(false);
  });

  it('smashes the circle ahead of it, then stands winded with its shield down', () => {
    const e = alone();
    const s = e.state;
    const p = s.players[0];
    const g = newElite(p.x + 300_000, p.y, 1, DOOR_GOD.hp, 1, 'doorGod');
    s.elites = [g];
    steps(e, 2);
    expect(g.phase).toBe('aim');
    expect(s.zones).toHaveLength(1);
    expect(s.zones[0].hurt).toBe(HURT.smash);
    expect(dist(s.zones[0].x - g.x, s.zones[0].y - g.y)).toBeGreaterThan(DOOR_GOD.reach - 10_000);
    const hurt = steps(e, THREATS.warn).filter((x) => x.type === 'hurt');
    expect(hurt.map((x) => (x.type === 'hurt' ? x.value : 0))).toEqual([chapterHurt(4, HURT.smash, s.wave)]);
    expect(g.phase).toBe('rest');
    expect(shielded(g, p.x, p.y)).toBe(false);
    steps(e, DOOR_GOD.rest);
    expect(g.phase).toBe('walk');
  });
});

describe('mid-boss and boss', () => {
  it('brings the empowered witch on wave 25 and the Underworld Judge on wave 50', () => {
    expect(chapterBoss(4)).toBe('judge');
    const e = new Engine(GHOST);
    beginWave(e.state, 25);
    expect(e.state.boss).toMatchObject({ kind: 'witch', empowered: true, hp: EMPOWERED_WITCH.hp });
    e.state.boss = null;
    beginWave(e.state, 50);
    expect(e.state.boss).toMatchObject({ kind: 'judge', empowered: false, hp: JUDGE.hp });
  });

  it('the empowered witch summons more and throws wider', () => {
    const e = alone();
    const s = e.state;
    const p = s.players[0];
    s.boss = newBoss(p.x + 240_000, p.y, EMPOWERED_WITCH.hp, true, 'witch');
    s.boss.cooldown = 1;
    steps(e, 40);
    expect(s.mobs.filter((m) => m.kind === 'skeleton')).toHaveLength(EMPOWERED_WITCH.summon);
    s.boss.cooldown = 1;
    s.boss.phase = 'walk';
    steps(e, 40);
    expect(s.bullets.length).toBe(EMPOWERED_WITCH.fan);
  });
});

describe('underworld judge (boss)', () => {
  function judge() {
    const e = alone();
    const s = e.state;
    const p = s.players[0];
    s.boss = newBoss(p.x + JUDGE.stopDist, p.y, JUDGE.hp, false, 'judge');
    s.boss.cooldown = 1;
    return { e, s, p, b: s.boss };
  }

  it('writes a line of zones through the hero that go off one after another', () => {
    const { e, s, p, b } = judge();
    expect(steps(e, 1).map((x) => x.type)).toContain('bossWindup');
    expect(steps(e, JUDGE.windup).map((x) => x.type)).toContain('bossCast');
    expect(s.zones).toHaveLength(JUDGE.zones);
    // all on the line from him to the hero (to its left), the hero inside one
    for (const z of s.zones) expect(Math.abs(z.y - p.y)).toBeLessThan(5_000);
    expect(s.zones.some((z) => dist(z.x - p.x, z.y - p.y) < JUDGE.radius)).toBe(true);
    expect(s.zones.every((z) => z.x < b.x)).toBe(true);
    // the nearest goes off first, the rest one stagger apart
    const blasts: number[] = [];
    for (let t = 0; t < THREATS.warn + JUDGE.zones * JUDGE.stagger; t++) {
      for (const ev of e.step([still(e)])) if (ev.type === 'blast') blasts.push(t);
    }
    expect(blasts).toHaveLength(JUDGE.zones);
    expect(blasts[JUDGE.zones - 1] - blasts[0]).toBe((JUDGE.zones - 1) * JUDGE.stagger);
  });

  it('then flicks an ink fan', () => {
    const { e, s, b } = judge();
    b.shots = 1;
    steps(e, JUDGE.windup + 1);
    expect(s.bullets.length).toBe(JUDGE.fan);
  });

  it('below half his health crosses two lines on the hero and throws full rings', () => {
    const { e, s, p, b } = judge();
    b.hp = Math.trunc((JUDGE.hp * JUDGE.ragePercent) / 100);
    expect(enraged(b)).toBe(true);
    steps(e, JUDGE.windup + 1);
    expect(s.zones).toHaveLength(2 * JUDGE.zones - 1);
    // the middle one sits on the hero and goes off first
    const first = s.zones.filter((z) => z.age === Math.max(...s.zones.map((q) => q.age)));
    expect(first).toHaveLength(1);
    expect(dist(first[0].x - p.x, first[0].y - p.y)).toBeLessThan(TRIG_ONE * 5);
    steps(e, JUDGE.recover);
    expect(b.cooldown).toBe(JUDGE.rageCooldown);
    b.cooldown = 1;
    steps(e, JUDGE.windup + 2);
    expect(s.bullets.length).toBe(JUDGE.ring);
  });
});
