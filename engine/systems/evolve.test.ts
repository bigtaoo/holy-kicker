import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, type RunConfig } from '../config';
import { EVOLVE, MAX_LEVEL, RELIC_AWAKENED, SPELL_CAST, SPELL_EVOLVED, SPELL_LEVELS, xpToNext } from '../content';
import { Engine } from '../Engine';
import type { PlayerCommand } from '../input';
import { newMob, type Player } from '../state';
import { evolutions } from './build';

// Evolutions and the relic's awakening (docs/content.md): when they are offered, and what
// each evolved form does differently.

const CHAPTER: RunConfig = { ...DEFAULT_RUN, waves: 50 };

function cmd(e: Engine, extra: Partial<PlayerCommand> = {}): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0, ...extra };
}

/** A chapter with the horde gone, the hero untouchable and not kicking, so only spells act. */
function quiet(): Engine {
  const e = new Engine(CHAPTER);
  e.state.mobs.length = 0;
  const p = e.state.players[0];
  p.hurtCd = 1e6;
  p.kickCd = 1e6;
  return e;
}

function steps(e: Engine, n: number) {
  const all = [];
  for (let i = 0; i < n; i++) all.push(...e.step([cmd(e)]));
  return all;
}

function evolved(p: Player, id: 'palm' | 'bolt' | 'incense' | 'bell' | 'cymbal'): void {
  p.spells = [{ id, level: MAX_LEVEL, cd: 1, evolved: true }];
}

describe('evolution offers', () => {
  it('needs the spell maxed and its paired passive, and comes first on the next level-up', () => {
    const e = quiet();
    const p = e.state.players[0];
    p.spells = [{ id: 'palm', level: MAX_LEVEL - 1, cd: 1, evolved: false }];
    p.passives = [{ id: 'eye', level: 1 }];
    expect(evolutions(p)).toEqual([]);
    p.spells[0].level = MAX_LEVEL;
    expect(evolutions(p)).toEqual([{ kind: 'evolve', id: 'palm' }]);
    p.passives = [{ id: 'wrath', level: 3 }];
    expect(evolutions(p)).toEqual([]);

    p.passives = [{ id: 'eye', level: 1 }];
    p.relic = MAX_LEVEL;
    p.passives.push({ id: 'legs', level: 1 });
    p.xp = xpToNext(1);
    e.step([cmd(e)]);
    expect(p.offer.slice(0, 2)).toEqual([{ kind: 'evolve', id: 'ball' }, { kind: 'evolve', id: 'palm' }]);
    expect(p.offer.length).toBe(3);
    e.step([cmd(e, { pick: 1 })]);
    expect(p.spells[0].evolved).toBe(true);
    expect(evolutions(p)).toEqual([{ kind: 'evolve', id: 'ball' }]);
    p.offer = [{ kind: 'evolve', id: 'ball' }];
    e.step([cmd(e, { pick: 0 })]);
    expect(p.awakened).toBe(true);
    expect(evolutions(p)).toEqual([]);
  });
});

describe('evolved spells', () => {
  it('Mountain Palm leaves a print that pins the mobs under it', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    // a crowd too tough to die, so it stays to be pinned
    for (let i = 0; i < 6; i++) s.mobs.push(newMob(p.x + 500_000 + i * 30_000, p.y, 1e9));
    evolved(p, 'palm');
    steps(e, 1);
    expect(s.fields.filter((f) => f.pin)).toHaveLength(0);
    steps(e, SPELL_CAST.palmFall);
    const prints = s.fields.filter((f) => f.pin);
    expect(prints.length).toBeGreaterThan(0);
    expect(prints[0].life).toBe(SPELL_EVOLVED.palm.life);
    const before = s.mobs.map((m) => [m.x, m.y]);
    steps(e, 10);
    const pinned = s.mobs.filter((m, i) => m.x === before[i][0] && m.y === before[i][1]);
    expect(pinned.length).toBeGreaterThan(0);
  });

  it('Endless Chain forks at every jump', () => {
    const run = (evolve: boolean) => {
      const e = quiet();
      const s = e.state;
      const p = s.players[0];
      for (let i = 0; i < 30; i++) s.mobs.push(newMob(p.x + 200_000 + (i % 6) * 120_000, p.y + Math.trunc(i / 6) * 120_000, 1e9));
      p.spells = [{ id: 'bolt', level: MAX_LEVEL, cd: 1, evolved: evolve }];
      return steps(e, 1).filter((v) => v.type === 'bolt').length;
    };
    expect(run(false)).toBe(SPELL_LEVELS.bolt[MAX_LEVEL - 1].count);
    expect(run(true)).toBe(SPELL_EVOLVED.bolt.count * 2);
  });

  it('Healing Incense heals the hero standing in it', () => {
    const e = quiet();
    const p = e.state.players[0];
    evolved(p, 'incense');
    p.hp = 10;
    steps(e, 30);
    expect(e.state.fields[0].heal).toBe(EVOLVE.incenseHeal);
    expect(p.hp).toBeGreaterThan(10);
  });

  it('Golden Body guards the hero longer after it breaks', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    evolved(p, 'bell');
    steps(e, 1);
    expect(p.bell).toBe(true);
    p.hurtCd = 0;
    s.mobs.push(newMob(p.x, p.y, 1e9));
    expect(steps(e, 1).map((v) => v.type)).toContain('bellBreak');
    expect(p.hurtCd).toBeGreaterThan(EVOLVE.bellGuard - 3);
  });

  it('Cymbal Wheel circles the hero for good and hits again after a while', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    evolved(p, 'cymbal');
    steps(e, 1);
    expect(s.cymbals.length).toBe(SPELL_EVOLVED.cymbal.count);
    expect(s.cymbals.every((c) => c.orbit === EVOLVE.wheelOrbit)).toBe(true);
    s.mobs.push(newMob(p.x + EVOLVE.wheelOrbit, p.y, 1e9));
    let hits = 0;
    for (let i = 0; i < 150; i++) {
      // held on the ring (a mob walks inside it otherwise)
      s.mobs[0].x = p.x + EVOLVE.wheelOrbit;
      s.mobs[0].y = p.y;
      hits += e.step([cmd(e)]).filter((v) => v.type === 'hit').length;
    }
    // still the same cymbals, and the mob was hit more than once per cymbal
    expect(s.cymbals.length).toBe(SPELL_EVOLVED.cymbal.count);
    expect(hits).toBeGreaterThan(SPELL_EVOLVED.cymbal.count);
    // they follow the hero
    p.x += 1_000_000;
    steps(e, 1);
    expect(Math.abs(s.cymbals[0].x - p.x)).toBeLessThanOrEqual(EVOLVE.wheelOrbit);
  });
});

describe('awakened relic', () => {
  it('Meteor Ball sends splinters at other targets on a bounce', () => {
    const e = new Engine(CHAPTER);
    const s = e.state;
    const p = s.players[0];
    s.mobs.length = 0;
    p.hurtCd = 1e6;
    for (let i = 0; i < 8; i++) s.mobs.push(newMob(p.x + 300_000 + (i % 4) * 100_000, p.y + Math.trunc(i / 4) * 100_000, 1e9));
    p.relic = MAX_LEVEL;
    p.awakened = true;
    let most = 0;
    let hits = 0;
    for (let i = 0; i < 60; i++) {
      hits += e.step([cmd(e)]).filter((v) => v.type === 'hit').length;
      most = Math.max(most, s.balls.length);
    }
    expect(most).toBeGreaterThan(1);
    expect(hits).toBeGreaterThan(RELIC_AWAKENED.hits);
  });
});
