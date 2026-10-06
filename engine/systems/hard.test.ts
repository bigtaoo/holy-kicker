import { describe, expect, it } from 'vitest';
import { BOSS, DEFAULT_RUN, ELITE, HARD, HURT, WAVES, type RunConfig } from '../config';
import { Engine } from '../Engine';
import { chapterHurt } from './players';
import { beginWave, chapterHp, eliteKinds, foeHp, mobHp, twinHp, waveFoeHp } from './waves';

// Hard mode (docs/design.md "Hard mode"): the chapters again for a hero with endgame gear,
// with HARD's mob health and hurt in place of the chapter's, tougher elites and bosses and one
// elite more on every elite wave.

const HARD_RUN: RunConfig = { ...DEFAULT_RUN, waves: 50, chapter: 1, hard: true };

describe('hard mode', () => {
  it('takes HARD.hp for the horde, ramped in over the run like the chapters', () => {
    expect(chapterHp(1, 1, true)).toBe(100);
    expect(chapterHp(1, 50, true)).toBeGreaterThan(HARD.hp[0]);
    expect(mobHp(30, 'chaser', 1, true)).toBeGreaterThan(mobHp(30, 'chaser', 5));
    expect(mobHp(30, 'chaser', 1)).toBe(mobHp(30, 'chaser', 1, false));
  });

  it('takes HARD.hurt for every blow', () => {
    expect(chapterHurt(1, 100, 50, true)).toBeGreaterThan(chapterHurt(5, 100, 50));
    expect(chapterHurt(1, HURT.mob, 1, true)).toBe(HURT.mob);
  });

  it('brings one more of the first elite on every elite wave', () => {
    expect(eliteKinds(1, 10, 50, true)).toEqual(['charger', 'charger']);
    expect(eliteKinds(2, 45, 50, true)).toEqual(['toadKing', 'charger', 'toadKing']);
    expect(eliteKinds(5, 10, 50, true)).toEqual(['wolfLeader', 'toadKing', 'wolfLeader']);
  });

  it('gives elites and bosses HARD.foeHp of their health', () => {
    const e = new Engine(HARD_RUN);
    beginWave(e.state, 10);
    expect(e.state.elites.map((x) => x.hp)).toEqual([waveFoeHp(ELITE.hp, 1, 10, true), waveFoeHp(ELITE.hp, 1, 10, true)]);
    expect(foeHp(ELITE.hp, 1, true)).toBe(Math.trunc((ELITE.hp * HARD.foeHp[0]) / 100));
    e.state.elites.length = 0;
    beginWave(e.state, WAVES.midBosses[0]);
    expect(e.state.elites.map((x) => x.hp)).toEqual([twinHp(1, WAVES.midBosses[0], true), twinHp(1, WAVES.midBosses[0], true)]);
    beginWave(e.state, 50);
    expect(e.state.boss?.hp).toBe(foeHp(BOSS.hp, 1, true));
    expect(foeHp(BOSS.hp, 1, false)).toBe(BOSS.hp);
  });
});
