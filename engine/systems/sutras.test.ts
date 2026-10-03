import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, HERO, type RunConfig } from '../config';
import { EVOLVE_PAIR, LOTUS, MAX_LEVEL, PASSIVES, ROAR, SPELL_EVOLVED, SPELL_LEVELS, SUTRA_IDS, type SpellId } from '../content';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import type { PlayerCommand } from '../input';
import { MAG_FULL } from '../input';
import { dist } from '../math/fixed';
import { BRAD_HALF } from '../math/trig';
import { newMob, newPlayer, type Player } from '../state';
import { cardPool, evolutions } from './build';
import { hurtPlayer } from './players';
import { haloSpin } from './sutras';

// The spells and the passive a sutra adds to the pool (docs/content.md "Spells", "Passives"):
// Lotus Steps, Halo Beam, Lion's Roar and Focus.

const CHAPTER: RunConfig = { ...DEFAULT_RUN, waves: 50, sutras: SUTRA_IDS };

function cmd(e: Engine, walk = false): PlayerCommand {
  // walking right
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: walk ? MAG_FULL : 0 };
}

/** A chapter with the horde gone and the hero untouchable and not kicking, so only spells act. */
function quiet(): Engine {
  const e = new Engine(CHAPTER);
  e.state.mobs.length = 0;
  e.state.elites.length = 0;
  const p = e.state.players[0];
  p.hurtCd = 1e6;
  p.kickCd = 1e6;
  p.level = 50;
  return e;
}

function steps(e: Engine, n: number, walk = false): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...e.step([cmd(e, walk)]));
  return all;
}

function learn(p: Player, id: SpellId, evolved = false, level = 1): void {
  p.spells = [{ id, level: evolved ? MAX_LEVEL : level, cd: 1, evolved }];
}

/** A mob that does not move or fall. */
function post(e: Engine, x: number, y: number): number {
  const s = e.state;
  s.mobs.push(newMob(x, y, 1e9));
  s.mobs[s.mobs.length - 1].stun = 1e6;
  return s.mobs.length - 1;
}

const hits = (events: SimEvent[]) => events.filter((v) => v.type === 'hit').length;

describe('sutras', () => {
  it('keep their spells and passive out of the pool until the run has them', () => {
    const p = newPlayer(0, 0, 0);
    const ids = (sutras: readonly string[]) => cardPool(p, sutras as never).map((c) => c.id);
    for (const id of SUTRA_IDS) expect(ids([])).not.toContain(id);
    expect(ids(['halo'])).toContain('halo');
    expect(ids(['halo'])).not.toContain('roar');
    expect(ids(SUTRA_IDS)).toEqual(expect.arrayContaining([...SUTRA_IDS]));
  });

  it('pair the new spells for evolution', () => {
    expect([EVOLVE_PAIR.lotus, EVOLVE_PAIR.halo, EVOLVE_PAIR.roar]).toEqual(['karma', 'calm', 'focus']);
    const p = newPlayer(0, 0, 0);
    learn(p, 'roar', false, MAX_LEVEL);
    p.passives = [{ id: 'focus', level: 1 }];
    expect(evolutions(p)).toEqual([{ kind: 'evolve', id: 'roar' }]);
  });
});

describe('Lotus Steps', () => {
  it('drops seeds while walking and none standing; with no enemy near they wither in their time', () => {
    const e = quiet();
    const p = e.state.players[0];
    learn(p, 'lotus');
    steps(e, 60);
    expect(e.state.lotuses.length).toBe(0);
    const row = SPELL_LEVELS.lotus[0];
    const events = steps(e, 150, true);
    // one every cooldown, each lasting its life
    expect(e.state.lotuses.length).toBeGreaterThanOrEqual(Math.floor(row.life / row.cooldown));
    expect(e.state.lotuses.length).toBeLessThanOrEqual(Math.ceil(row.life / row.cooldown));
    expect(events.some((v) => v.type === 'bloom')).toBe(false);
  });

  it('blooms at its time when an enemy is within the bloom without stepping on it', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    learn(p, 'lotus');
    steps(e, 2, true);
    const seed = s.lotuses[0];
    post(e, seed.x, seed.y + LOTUS.trigger + 40_000);
    const events = steps(e, seed.life);
    expect(events.filter((v) => v.type === 'bloom').length).toBe(1);
    expect(hits(events)).toBe(1);
  });

  it('blooms when an enemy steps on an armed seed, hurting what is near', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    learn(p, 'lotus');
    steps(e, 2, true);
    expect(s.lotuses.length).toBe(1);
    const seed = s.lotuses[0];
    // standing on it before it is armed does nothing
    post(e, seed.x, seed.y + 40_000);
    post(e, seed.x + 120_000, seed.y);
    let events = steps(e, LOTUS.arm - 3);
    expect(events.some((v) => v.type === 'bloom')).toBe(false);
    events = steps(e, 4);
    expect(events.filter((v) => v.type === 'bloom').length).toBe(1);
    expect(s.lotuses.some((l) => l.id === seed.id)).toBe(false);
    expect(hits(events)).toBe(2);
  });

  it('Lotus Path sends the gems near a bloom to the hero', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    learn(p, 'lotus', true);
    s.lotuses.push({ id: 999, owner: 0, x: 2_000_000, y: 0, radius: 200_000, damage: 100, age: LOTUS.arm, life: 1000, pull: true });
    post(e, 2_000_000, 30_000);
    s.mobs[0].hp = 1;
    // the bloom fells the mob; its gem and one dropped near the seed fly in
    steps(e, 1);
    expect(s.gems.length).toBeGreaterThan(0);
    expect(s.gems.every((g) => g.flying)).toBe(true);
    expect(SPELL_EVOLVED.lotus.cooldown).toBeLessThan(SPELL_LEVELS.lotus[MAX_LEVEL - 1].cooldown);
  });
});

describe('Halo Beam', () => {
  it('hits a target once per turn, and each of three beams once when evolved', () => {
    for (const evolved of [false, true]) {
      const e = quiet();
      const p = e.state.players[0];
      learn(p, 'halo', evolved);
      post(e, p.x + 200_000, p.y + 50_000);
      const row = evolved ? SPELL_EVOLVED.halo : SPELL_LEVELS.halo[0];
      // just short of two whole turns
      expect(hits(steps(e, Math.floor((2 * 65536) / haloSpin(p, row.life))))).toBe(2 * row.count);
    }
  });

  it('reaches further standing still than walking', () => {
    const e = quiet();
    const p = e.state.players[0];
    learn(p, 'halo');
    const len = SPELL_LEVELS.halo[0].radius;
    const turn = Math.ceil(65536 / haloSpin(p, SPELL_LEVELS.halo[0].life));
    post(e, p.x, p.y + Math.trunc(len * 0.8));
    expect(hits(steps(e, turn))).toBe(1);
    // walking, the target walks along out of reach
    const m = e.state.mobs[0];
    let n = 0;
    for (let i = 0; i < turn; i++) {
      m.x = p.x;
      m.y = p.y + Math.trunc(len * 0.8);
      n += hits(e.step([cmd(e, true)]));
    }
    expect(n).toBe(0);
  });
});

describe("Lion's Roar", () => {
  it('shouts in a cone at the nearest enemy and pushes back what it does not fell', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    learn(p, 'roar');
    const near = post(e, p.x - 150_000, p.y);
    const side = post(e, p.x - 250_000, p.y + 60_000);
    const behind = post(e, p.x + 200_000, p.y);
    // walking right, away from it: the roar still turns on the nearest
    const events = steps(e, 2, true);
    expect(events.find((v) => v.type === 'roar')).toMatchObject({ brad: BRAD_HALF, full: false });
    expect(hits(events)).toBe(2);
    expect(dist(s.mobs[near].x - p.x, s.mobs[near].y - p.y)).toBeGreaterThan(150_000 + ROAR.knockback - 40_000);
    expect(s.mobs[side].x).toBeLessThan(p.x - 250_000);
    expect(dist(s.mobs[behind].x - p.x, s.mobs[behind].y - p.y)).toBeLessThan(220_000);
  });

  it('waits while nothing is in reach', () => {
    const e = quiet();
    const p = e.state.players[0];
    learn(p, 'roar');
    post(e, p.x + 900_000, p.y);
    expect(steps(e, 30).some((v) => v.type === 'roar')).toBe(false);
  });

  it('Thunder Roar goes all the way round and shatters bullets', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    learn(p, 'roar', true);
    post(e, p.x + 200_000, p.y);
    post(e, p.x - 200_000, p.y);
    s.bullets.push({ x: p.x, y: p.y - 300_000, px: p.x, py: p.y - 300_000, vx: 0, vy: 0, age: 0 });
    const events = steps(e, 2);
    expect(events.find((v) => v.type === 'roar')).toMatchObject({ full: true });
    expect(hits(events)).toBe(2);
    expect(s.bullets.length).toBe(0);
  });
});

describe('Focus', () => {
  it('makes spells last longer and the hero untouchable longer after a blow', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.spells = [{ id: 'incense', level: 1, cd: 1, evolved: false }];
    p.passives = [{ id: 'focus', level: 2 }];
    post(e, p.x + 100_000, p.y);
    steps(e, 1);
    const grow = 100 + 2 * PASSIVES.focus.perLevel;
    expect(s.fields[0].life).toBe(Math.trunc((SPELL_LEVELS.incense[0].life * grow) / 100));
    p.hurtCd = 0;
    hurtPlayer(s, [], 0, 1);
    expect(p.hurtCd).toBe(Math.trunc((HERO.hurtCooldown * (100 + 2 * PASSIVES.focus.also!.perLevel)) / 100));
  });
});
