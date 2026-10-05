import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, HERO, MONK_PASSIVE, type RunConfig } from '../config';
import type { MonkId } from '../content';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import { newMob } from '../state';
import { maxHpOf, stat } from './build';
import { monkBonus } from './monks';
import { hurtPlayer } from './players';

// The monks (docs/content.md "Monks"): stats added to the gear's, the fat monk's Belly Bounce
// and the novice's Light Feet.

function engine(monk: MonkId): Engine {
  const run: RunConfig = { ...DEFAULT_RUN, waves: 50, monk, bonus: { maxHp: 20 } };
  const e = new Engine(run);
  e.state.mobs.length = 0;
  e.state.elites.length = 0;
  e.state.boss = null;
  return e;
}

describe('monks', () => {
  it('adds the monk stats to the gear', () => {
    expect(monkBonus({ maxHp: 20, attack: 5 }, 'fat')).toEqual({ maxHp: 70, attack: 5, speed: -15 });
    expect(monkBonus({ maxHp: 30 }, 'novice')).toEqual({ speed: 20, xp: 15 });
    expect(monkBonus({ maxHp: 20 }, 'kicker')).toEqual({ maxHp: 20 });
    const fat = engine('fat').state.players[0];
    expect(fat.hp).toBe(maxHpOf(fat));
    expect(fat.maxHp).toBe(Math.trunc((HERO.hp * 170) / 100));
    expect(stat(engine('novice').state.players[0], 'speed')).toBe(20);
  });

  it('bounces the crowd off the fat monk when he is hit', () => {
    const e = engine('fat');
    const s = e.state;
    const p = s.players[0];
    s.mobs.push(newMob(p.x + 100_000, p.y, 1e9), newMob(p.x + MONK_PASSIVE.radius + 50_000, p.y, 1e9));
    const events: SimEvent[] = [];
    hurtPlayer(s, events, 0, 5);
    expect(events.some((v) => v.type === 'bounce')).toBe(true);
    expect(s.mobs[0].hp).toBeLessThan(1e9);
    expect(s.mobs[0].x).toBe(p.x + 100_000 + MONK_PASSIVE.knockback);
    expect(s.mobs[1].hp).toBe(1e9);
    const kicker = engine('kicker');
    const ev: SimEvent[] = [];
    hurtPlayer(kicker.state, ev, 0, 5);
    expect(ev.some((v) => v.type === 'bounce')).toBe(false);
  });

  it('lets every third blow miss the novice while he runs, never standing', () => {
    const e = engine('novice');
    const s = e.state;
    const p = s.players[0];
    p.moving = true;
    const taken: number[] = [];
    for (let i = 0; i < 6; i++) {
      p.hurtCd = 0;
      const events: SimEvent[] = [];
      hurtPlayer(s, events, 0, 5);
      taken.push(events.some((v) => v.type === 'dodge') ? 0 : 1);
    }
    expect(taken).toEqual([1, 1, 0, 1, 1, 0]);
    expect(p.hurtCd).toBe(HERO.hurtCooldown);
    p.moving = false;
    for (let i = 0; i < 3; i++) {
      p.hurtCd = 0;
      const events: SimEvent[] = [];
      hurtPlayer(s, events, 0, 1);
      expect(events.some((v) => v.type === 'dodge')).toBe(false);
    }
  });
});
