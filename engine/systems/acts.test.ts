import { describe, expect, it } from 'vitest';
import { ACTS, AFFIX, BOSS, CARP, affixList, CHAPTER_MOBS, DEFAULT_RUN, type RunConfig } from '../config';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import { newElite } from '../state';
import { arm, foeHurt, guards } from './affixes';
import { beginWave, bossUp, eliteKinds, foeHp, newcomer, rushOf, waveSystem } from './waves';

// The acts' rules (acts.ts, docs/design.md "Acts"): the next map's newcomers and paired elites
// from act 2, affixes from act 3, the boss rush from act 4.

const run = (chapter: number): Engine => new Engine({ ...DEFAULT_RUN, waves: 50, chapter } as RunConfig);

describe('the acts', () => {
  it('mixes the next map in from act 2, ACTS.mixDelay waves after its own start', () => {
    const next = CHAPTER_MOBS[1][0];
    const kinds = (c: number, wave: number) => new Set(Array.from({ length: 120 }, (_, n) => newcomer(c, wave, n)));
    expect(kinds(1, 50).has(next.kind)).toBe(false);
    expect(kinds(6, next.from + ACTS.mixDelay - 1).has(next.kind)).toBe(false);
    expect(kinds(6, next.from + ACTS.mixDelay).has(next.kind)).toBe(true);
  });

  it('pairs the map elite from act 2, and hard mode adds one more', () => {
    expect(eliteKinds(2, 10, 50)).toEqual(['toadKing']);
    expect(eliteKinds(7, 10, 50)).toEqual(['toadKing', 'toadKing']);
    expect(eliteKinds(7, 10, 50, true)).toEqual(['toadKing', 'toadKing', 'toadKing']);
  });

  it('arms elites with one affix and bosses with two from act 3', () => {
    const early = run(7).state;
    const e = newElite(0, 0, 1, 400);
    arm(early, e, false);
    expect(e.affixes).toBe(0);
    const s = run(12).state;
    for (let k = 0; k < 20; k++) {
      arm(s, e, false);
      expect(affixList(e.affixes)).toHaveLength(ACTS.eliteAffixes);
      arm(s, e, true);
      expect(affixList(e.affixes)).toHaveLength(ACTS.bossAffixes);
    }
  });

  it('blocks whole hits with the shield, then lets them through', () => {
    const e = newElite(0, 0, 1, 400);
    e.affixes = 1;
    e.guard = AFFIX.shieldBlocks;
    for (let k = 0; k < AFFIX.shieldBlocks; k++) expect(guards(e)).toBe(true);
    expect(guards(e)).toBe(false);
  });

  it('splits into shards and explodes at every quarter lost', () => {
    const s = run(12).state;
    const e = newElite(0, 0, 1, 400);
    e.affixes = 4 | 8;
    e.hp = 100;
    foeHurt(s, e, 400);
    expect(s.spawns.filter((p) => p.kind === 'shard')).toHaveLength(3 * AFFIX.splitShards);
    expect(s.zones).toHaveLength(3);
    foeHurt(s, e, 100);
    expect(s.zones).toHaveLength(3);
  });

  it('ends act 4 on a boss rush, the next map leading at part health', () => {
    expect(rushOf(1)).toEqual(['abbot']);
    expect(rushOf(15)).toEqual(['demon']);
    expect(rushOf(16)).toEqual(['carp', 'abbot']);
    expect(rushOf(19)).toEqual(['abbot', 'judge']);
    expect(rushOf(20)).toEqual(['abbot', 'carp', 'witch', 'judge', 'demon']);
    const s = run(16).state;
    s.tick = 1;
    beginWave(s, 50);
    expect(s.boss!.kind).toBe('carp');
    expect(s.boss!.hp).toBe(Math.trunc((foeHp(CARP.hp, 16, false) * ACTS.rushLeadPercent) / 100));
    expect(s.rush).toEqual(['abbot']);
    s.boss!.hp = 0;
    s.boss!.phase = 'down';
    s.boss!.t = 0;
    const events: SimEvent[] = [];
    waveSystem(s, events);
    expect(s.outcome).toBe('playing');
    expect(bossUp(s)).toBe(true);
    s.boss!.t = ACTS.rushAfter;
    waveSystem(s, events);
    expect(events).toContainEqual({ type: 'bossNext', kind: 'abbot' });
    expect(s.boss!.kind).toBe('abbot');
    expect(s.boss!.affixes).not.toBe(0);
    expect(s.boss!.hp).toBe(foeHp(BOSS.hp, 16, false));
    s.boss!.phase = 'down';
    waveSystem(s, events);
    expect(s.outcome).toBe('won');
  });
});
