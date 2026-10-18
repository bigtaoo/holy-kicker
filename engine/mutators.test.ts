import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, HERO, MOB_KINDS, type RunConfig } from './config';
import { Engine } from './Engine';
import { MUTATOR_IDS, MUTATORS, mutatorBonus, mutatorOf, mutatorSpeed } from './mutators';
import { gainXp } from './systems/build';
import { beginWave, eliteKinds } from './systems/waves';

// The challenge mutators (docs/design.md "Challenges"): one rule bent for everyone in the run.

const RUN: RunConfig = { ...DEFAULT_RUN, waves: 50, chapter: 2 };

describe('mutators', () => {
  it('knows its ids and plays an unknown or missing one as none', () => {
    expect(MUTATOR_IDS.map(mutatorOf)).toEqual([...MUTATOR_IDS]);
    expect([mutatorOf('nope'), mutatorOf(null), mutatorOf(undefined)]).toEqual([null, null, null]);
  });

  it('elites: brings one more of the first elite on every elite wave, on top of hard mode', () => {
    expect(eliteKinds(1, 10, 50, false, 'elites')).toEqual(['charger', 'charger']);
    expect(eliteKinds(2, 45, 50, false, 'elites')).toEqual(['toadKing', 'charger', 'toadKing']);
    expect(eliteKinds(1, 10, 50, true, 'elites')).toEqual(['charger', 'charger', 'charger']);
    expect(eliteKinds(1, 10, 50, false, 'swift')).toEqual(['charger']);
    const e = new Engine({ ...RUN, mutator: 'elites' });
    beginWave(e.state, 10);
    expect(e.state.elites).toHaveLength(1 + MUTATORS.elites.more);
  });

  it('swift: the horde walks faster, nothing else does', () => {
    const v = MOB_KINDS.chaser.speed;
    expect(mutatorSpeed(v, 'swift')).toBe(Math.trunc((v * MUTATORS.swift.speedPercent) / 100));
    expect(mutatorSpeed(v, 'swift')).toBeGreaterThan(v);
    expect(mutatorSpeed(v, null)).toBe(v);
    const walked = (mutator: RunConfig['mutator']) => {
      const e = new Engine({ ...RUN, mutator });
      const m = e.state.mobs[0];
      const p = e.state.players[0];
      const before = Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
      for (let i = 0; i < 10; i++) e.step([{ owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 }]);
      return before - (Math.abs(m.x - p.x) + Math.abs(m.y - p.y));
    };
    expect(walked('swift')).toBeGreaterThan(walked(null));
  });

  it('glass: the hero starts with half the base health and gains double XP', () => {
    expect(mutatorBonus({ maxHp: 20 }, 'glass')).toEqual({ maxHp: -30, xp: 100 });
    expect(mutatorBonus({ maxHp: 20 }, 'elites')).toEqual({ maxHp: 20 });
    const p = new Engine({ ...RUN, mutator: 'glass' }).state.players[0];
    expect([p.hp, p.maxHp]).toEqual([HERO.hp / 2, HERO.hp / 2]);
    const q = new Engine(RUN).state.players[0];
    gainXp(p, 10);
    gainXp(q, 10);
    expect(p.xp).toBe(2 * q.xp);
  });
});
