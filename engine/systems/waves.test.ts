import { describe, expect, it } from 'vitest';
import { BOSS, DEFAULT_RUN, ELITE, HERO, HORDE, HURT, SHRINE, WAVES, type RunConfig } from '../config';
import { Engine } from '../Engine';
import { hashState } from '../hash';
import type { PlayerCommand } from '../input';
import { hordeSize, isBossWave, isEliteWave, isShrineWave, mobHp } from './waves';

const CHAPTER: RunConfig = { ...DEFAULT_RUN, waves: 50 };

function still(e: Engine, extra: Partial<PlayerCommand> = {}): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0, ...extra };
}

/** Steps n ticks with the stick at rest, taking the first card of any level-up; returns the event types. */
function idle(e: Engine, n: number): string[] {
  const out: string[] = [];
  const pick = () => (e.state.players[0].offer.length > 0 ? { pick: 0 } : {});
  for (let i = 0; i < n; i++) out.push(...e.step([still(e, pick())]).map((ev) => ev.type));
  return out;
}

/** Puts a mob on the hero, so the next tick's contact lands. */
function touch(e: Engine): void {
  const p = e.state.players[0];
  e.state.mobs[0].x = p.x + 1000;
  e.state.mobs[0].y = p.y;
}

describe('wave plan', () => {
  it('grows the horde every wave up to its cap', () => {
    expect(hordeSize(1)).toBe(WAVES.hordeBase);
    expect(hordeSize(2)).toBe(WAVES.hordeBase + WAVES.hordeStep);
    expect(hordeSize(1000)).toBe(WAVES.hordeMax);
  });

  it('toughens the horde faster in later waves; the sandbox horde dies in one hit', () => {
    expect(mobHp(0)).toBe(1);
    expect(mobHp(1)).toBe(HORDE.hp);
    const gain = (w: number) => mobHp(w + 10) - mobHp(w);
    expect(gain(1)).toBeGreaterThan(0);
    expect(gain(40)).toBeGreaterThan(gain(1) * 3);
  });

  it('puts elites on every tenth wave and bosses on the mid and last waves', () => {
    const elites = Array.from({ length: 50 }, (_, i) => i + 1).filter((w) => isEliteWave(w, 50));
    const bosses = Array.from({ length: 50 }, (_, i) => i + 1).filter((w) => isBossWave(w, 50));
    expect(elites).toEqual([10, 20, 30, 40]);
    expect(bosses).toEqual([WAVES.midBoss, 50]);
    // a short chapter ends on its boss and has no mid-boss
    expect(isBossWave(WAVES.midBoss, 20)).toBe(false);
    expect(isEliteWave(20, 20)).toBe(false);
  });
});

describe('chapter run', () => {
  it('starts on wave 1 with a small horde and moves on after a wave length', () => {
    const e = new Engine(CHAPTER);
    const s = e.state;
    expect(s).toMatchObject({ wave: 1, elite: null, boss: null, outcome: 'playing' });
    expect(s.mobs.length).toBe(hordeSize(1));
    expect(s.players[0]).toMatchObject({ hp: HERO.hp, revives: 1 });
    const types = idle(e, WAVES.ticks);
    expect(types.filter((t) => t === 'wave')).toEqual(['wave']);
    expect(s.wave).toBe(2);
    expect(s.mobs.length).toBe(hordeSize(2));
  });

  it('holds a boss wave until the boss falls, and wins on the last one', () => {
    const e = new Engine({ ...CHAPTER, waves: 1 });
    const s = e.state;
    expect(s.boss).toMatchObject({ hp: BOSS.hp, maxHp: BOSS.hp });
    s.players[0].hurtCd = 1e6;
    idle(e, WAVES.ticks + 5);
    expect(s).toMatchObject({ wave: 1, outcome: 'playing' });
    s.boss!.hp = 0;
    s.boss!.phase = 'down';
    expect(idle(e, 1)).toContain('cleared');
    expect(s.outcome).toBe('won');
    // a finished run stands still
    const h = hashState({ ...s, tick: 0 });
    idle(e, 10);
    expect(hashState({ ...s, tick: 0 })).toBe(h);
  });

  it('brings a weaker mid-boss and an elite that can fall', () => {
    const e = new Engine(CHAPTER);
    const s = e.state;
    s.players[0].hurtCd = 1e6;
    s.wave = WAVES.midBoss - 1;
    s.waveT = WAVES.ticks - 1;
    expect(idle(e, 1)).toContain('wave');
    expect(s.boss!.maxHp).toBe(Math.trunc((BOSS.hp * WAVES.midBossHpPercent) / 100));
    s.wave = 9;
    s.waveT = WAVES.ticks - 1;
    s.boss = null;
    idle(e, 1);
    expect(s.elite).toMatchObject({ hp: ELITE.hp });
  });

  it('loses health on contact, goes down at 0 and comes back once with a revive', () => {
    const e = new Engine(CHAPTER);
    const s = e.state;
    const p = s.players[0];
    touch(e);
    const ev = e.step([still(e)]);
    expect(ev).toContainEqual({ type: 'hurt', owner: 0, value: HURT.mob });
    expect(p.hp).toBe(HERO.hp - HURT.mob);

    p.hp = 1;
    p.hurtCd = 0;
    touch(e);
    expect(idle(e, 1)).toContain('heroDown');
    expect(s.outcome).toBe('lost');
    const x = s.mobs.map((m) => m.x);
    idle(e, 5);
    expect(s.mobs.map((m) => m.x)).toEqual(x);

    touch(e);
    expect(e.step([still(e, { revive: true })]).map((v) => v.type)).toContain('revive');
    expect(p).toMatchObject({ dead: false, hp: HERO.hp, revives: 0 });
    expect(s.outcome).toBe('playing');
    // the mob on him was sent back to the ring, and he is untouchable for a moment
    expect(Math.hypot(s.mobs[0].x - p.x, s.mobs[0].y - p.y)).toBeGreaterThan(HERO.reviveClear);

    p.hp = 1;
    p.hurtCd = 0;
    touch(e);
    idle(e, 1);
    e.step([still(e, { revive: true })]);
    expect(s.outcome).toBe('lost');
  });

  it('keeps the sandbox hero on his feet and its elite standing', () => {
    const e = new Engine({ ...DEFAULT_RUN, waves: 0 });
    const s = e.state;
    touch(e);
    const ev = e.step([still(e)]);
    expect(ev).toContainEqual({ type: 'hurt', owner: 0, value: 0 });
    expect(s.players[0].hp).toBe(HERO.hp);
    expect(s.wave).toBe(0);
    expect(s.elite?.hp).toBe(ELITE.hp);
  });
});

describe('shrines', () => {
  /** A chapter about to start wave `wave`, the hero untouchable. */
  function before(wave: number): Engine {
    const e = new Engine(CHAPTER);
    e.state.players[0].hurtCd = 1e6;
    e.state.wave = wave - 1;
    e.state.waveT = WAVES.ticks - 1;
    return e;
  }

  const kinds = (e: Engine) => e.state.players[0].offer.map((c) => `${c.kind}:${c.id}`);

  it('come on waves 5, 15, ... 45', () => {
    expect(Array.from({ length: 50 }, (_, i) => i + 1).filter((w) => isShrineWave(w, 50))).toEqual([5, 15, 25, 35, 45]);
  });

  it('pause the run on three cards; heal restores half the health', () => {
    const e = before(SHRINE.first);
    const s = e.state;
    const p = s.players[0];
    p.hp = 10;
    e.step([still(e)]);
    expect(s.wave).toBe(SHRINE.first);
    expect(kinds(e)).toEqual(['shrine:heal', 'shrine:insight', 'shrine:offering']);
    const tick = s.waveT;
    e.step([still(e)]);
    expect(s.waveT).toBe(tick);
    e.step([still(e, { pick: 0 })]);
    expect(p.hp).toBe(10 + Math.trunc((p.maxHp * SHRINE.healPercent) / 100));
    expect(p.offer).toEqual([]);
  });

  it('insight deals a level-up offer without a level', () => {
    const e = before(SHRINE.first);
    const p = e.state.players[0];
    e.step([still(e)]);
    e.step([still(e, { pick: 1 })]);
    expect(p.level).toBe(1);
    expect(p.offer.length).toBe(3);
    expect(p.offer.every((c) => c.kind !== 'shrine')).toBe(true);
  });

  it('an offering is paid when the hero reaches the next shrine up', () => {
    const e = before(SHRINE.first);
    const s = e.state;
    const p = s.players[0];
    e.step([still(e)]);
    e.step([still(e, { pick: 2 })]);
    expect(p).toMatchObject({ bet: true, offerings: 0 });
    s.wave = SHRINE.first + SHRINE.every - 1;
    s.waveT = WAVES.ticks - 1;
    e.step([still(e)]);
    expect(p).toMatchObject({ bet: false, offerings: 1 });
  });
});
