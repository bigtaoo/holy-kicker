import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, HERO, type RunConfig } from '../config';
import { FIRST_RUN_DEALS, LEVELING, MAX_LEVEL, MAX_PASSIVES, OFFER_SIZE, OPENING_DEAL, PASSIVES, RELIC_LEVELS, SPELL_CAST, SPELL_LEVELS, xpToNext } from '../content';
import type { SimEvent } from '../events';
import { Engine } from '../Engine';
import { hashState } from '../hash';
import type { PlayerCommand } from '../input';
import { TICK_RATE } from '../math/fixed';
import { newElite, newMob } from '../state';
import { cardPool, stat } from './build';

const CHAPTER: RunConfig = { ...DEFAULT_RUN, waves: 50 };

function cmd(e: Engine, extra: Partial<PlayerCommand> = {}): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0, ...extra };
}

/** A chapter with the horde far away and the hero untouchable, so only the build acts. */
function quiet(firstRun = false): Engine {
  const e = new Engine({ ...CHAPTER, firstRun });
  e.state.mobs.length = 0;
  e.state.players[0].hurtCd = 1e6;
  return e;
}

describe('levelling', () => {
  it('follows the experience curve', () => {
    expect(xpToNext(1)).toBe(LEVELING.first);
    // the floor spaces out the next few, then the curve takes over
    expect(xpToNext(2)).toBe(LEVELING.least);
    expect(xpToNext(3)).toBe(LEVELING.least);
    expect(xpToNext(10)).toBeGreaterThan(xpToNext(9));
  });

  it('opens an offer of distinct cards on a level-up and stands still until a pick', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.xp = xpToNext(1) + 2;
    expect(e.step([cmd(e)]).map((v) => v.type)).toContain('levelUp');
    expect(p).toMatchObject({ level: 2, xp: 2 });
    expect(p.offer.length).toBe(OFFER_SIZE);
    expect(new Set(p.offer.map((c) => `${c.kind}:${c.id}`)).size).toBe(OFFER_SIZE);

    const h = hashState({ ...s, tick: 0 });
    for (let i = 0; i < 10; i++) e.step([cmd(e)]);
    expect(hashState({ ...s, tick: 0 })).toBe(h);
    // a pick past the offer is ignored
    e.step([cmd(e, { pick: 7 })]);
    expect(p.offer.length).toBe(OFFER_SIZE);

    const card = p.offer[1];
    expect(e.step([cmd(e, { pick: 1 })])).toContainEqual({ type: 'pick', owner: 0, kind: card.kind, id: card.id });
    expect(p.offer).toEqual([]);
    const x = p.x;
    e.step([cmd(e, { moveMag: 255 })]);
    expect(p.x).not.toBe(x);
  });

  it('deals only the opening spells on the first level-ups', () => {
    const e = quiet();
    const p = e.state.players[0];
    for (let deal = 1; deal <= OPENING_DEAL.deals + 1; deal++) {
      p.xp = xpToNext(p.level);
      e.step([cmd(e)]);
      const opening = p.offer.every((c) => c.kind === 'spell' && OPENING_DEAL.spells.includes(c.id as never));
      expect(opening).toBe(deal <= OPENING_DEAL.deals);
      if (deal > OPENING_DEAL.deals) break;
      e.step([cmd(e, { pick: 0 })]);
    }
    expect(p.spells.length).toBe(OPENING_DEAL.deals);
  });

  it("deals a first run's steered card first, and the evolved incense once the list is taken", () => {
    const e = quiet(true);
    const p = e.state.players[0];
    for (const card of FIRST_RUN_DEALS) {
      p.xp = xpToNext(p.level);
      e.step([cmd(e)]);
      expect(p.offer[0]).toEqual(card);
      expect(p.offer.filter((c) => c.kind === card.kind && c.id === card.id)).toHaveLength(1);
      e.step([cmd(e, { pick: 0 })]);
    }
    expect(p.spells.find((sp) => sp.id === 'incense')?.level).toBe(MAX_LEVEL);
    p.xp = xpToNext(p.level);
    e.step([cmd(e)]);
    expect(p.offer[0]).toEqual({ kind: 'evolve', id: 'incense' });
  });

  it("skips a first run's card that can no longer be taken", () => {
    const e = quiet(true);
    const p = e.state.players[0];
    p.spells.push({ id: 'bomb', level: MAX_LEVEL, cd: 0, evolved: false });
    p.xp = xpToNext(p.level);
    e.step([cmd(e)]);
    expect(p.offer.some((c) => c.id === 'bomb')).toBe(false);
  });

  it('offers the next level right after a pick when the experience covers it', () => {
    const e = quiet();
    const p = e.state.players[0];
    p.xp = xpToNext(1) + xpToNext(2);
    e.step([cmd(e)]);
    expect(p.level).toBe(2);
    e.step([cmd(e, { pick: 0 })]);
    expect(p.level).toBe(3);
    expect(p.offer.length).toBe(OFFER_SIZE);
  });

  it('keeps the hero untouchable a moment after the last card of a chain of offers', () => {
    const e = new Engine(CHAPTER);
    e.state.mobs.length = 0;
    const p = e.state.players[0];
    p.xp = xpToNext(1) + xpToNext(2);
    e.step([cmd(e)]);
    // a pick that opens the next offer gives no guard yet
    e.step([cmd(e, { pick: 0 })]);
    expect(p.offer.length).toBe(OFFER_SIZE);
    expect(p.hurtCd).toBe(0);
    // the last pick does; the same tick already counts one down
    e.step([cmd(e, { pick: 0 })]);
    expect(p.offer).toEqual([]);
    expect(p.hurtCd).toBe(HERO.pickGuard - 1);
    // a longer guard is never cut short
    p.hurtCd = 100;
    p.xp = xpToNext(p.level);
    e.step([cmd(e)]);
    e.step([cmd(e, { pick: 0 })]);
    expect(p.hurtCd).toBe(98);
  });

  it('does not level up in the sandbox', () => {
    const e = new Engine({ ...DEFAULT_RUN, waves: 0 });
    const p = e.state.players[0];
    p.xp = 1000;
    e.step([cmd(e)]);
    expect(p).toMatchObject({ level: 1, offer: [] });
  });
});

describe('card pool', () => {
  it('drops maxed items and new ones once the slots are full', () => {
    const e = quiet();
    const p = e.state.players[0];
    expect(cardPool(p).length).toBe(1 + 8 + 7);
    p.relic = MAX_LEVEL;
    p.passives = (['calm', 'iron', 'legs', 'eye'] as const).slice(0, MAX_PASSIVES).map((id) => ({ id, level: MAX_LEVEL }));
    p.passives[0].level = 2;
    p.spells = [{ id: 'palm', level: MAX_LEVEL, cd: 1, evolved: false }];
    expect(cardPool(p)).toEqual([
      { kind: 'spell', id: 'bolt' }, { kind: 'spell', id: 'incense' }, { kind: 'spell', id: 'bell' }, { kind: 'spell', id: 'cymbal' },
      { kind: 'spell', id: 'talisman' }, { kind: 'spell', id: 'bomb' }, { kind: 'spell', id: 'knives' },
      { kind: 'passive', id: 'calm' },
    ]);
  });
});

describe('build effects', () => {
  it('stacks passives into stats, and more max health comes filled', () => {
    const e = quiet();
    const p = e.state.players[0];
    p.passives = [{ id: 'legs', level: 2 }];
    expect(stat(p, 'speed')).toBe(PASSIVES.legs.perLevel * 2);
    expect(stat(p, 'crit')).toBe(0);
    p.hp = 50;
    p.offer = [{ kind: 'passive', id: 'iron' }];
    e.step([cmd(e, { pick: 0 })]);
    const max = Math.trunc((HERO.hp * (100 + PASSIVES.iron.perLevel)) / 100);
    expect(p).toMatchObject({ maxHp: max, hp: 50 + max - HERO.hp });
  });

  it('regenerates with Alms Rice', () => {
    const e = quiet();
    const p = e.state.players[0];
    p.passives = [{ id: 'rice', level: 5 }];
    p.hp = 50;
    for (let i = 0; i < TICK_RATE * 5; i++) e.step([cmd(e)]);
    // 0.4 % of 100 per level per second: 2 health a second at level 5
    expect(p.hp).toBe(60);
  });

  it('kicks harder and bounces more at higher relic levels', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.relic = MAX_LEVEL;
    for (let i = 0; i < 6; i++) s.mobs.push(newMob(p.x + 300_000, p.y + i * 300_000));
    let hits = 0;
    for (let i = 0; i < 90; i++) {
      const ev = e.step([cmd(e)]);
      // one kick only
      if (ev.some((v) => v.type === 'kick')) p.kickCd = 1e6;
      hits += ev.filter((v) => v.type === 'hit').length;
    }
    expect(hits).toBe(RELIC_LEVELS[MAX_LEVEL - 1].hits);
    expect(s.balls.length).toBe(0);
  });

  it('casts learned spells on their cooldowns', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.kickCd = 1e6;
    for (let i = 0; i < 8; i++) s.mobs.push(newMob(p.x + 400_000 + i * 20_000, p.y));
    p.spells = [{ id: 'bolt', level: 1, cd: 1, evolved: false }, { id: 'palm', level: 1, cd: 1, evolved: false }, { id: 'incense', level: 1, cd: 1, evolved: false }];
    const ev = e.step([cmd(e)]);
    const casts = ev.filter((v) => v.type === 'cast').map((v) => v.type === 'cast' && v.kind);
    expect(casts).toEqual(['field']);
    expect(ev.filter((v) => v.type === 'bolt').length).toBeGreaterThan(0);
    expect(ev.filter((v) => v.type === 'mobDown').length).toBeGreaterThan(0);
    // the palm falls first and lands its blast after SPELL_CAST.palmFall
    const palm = ev.find((v) => v.type === 'palm');
    expect(palm).toMatchObject({ fall: SPELL_CAST.palmFall, print: 0 });
    let landed: SimEvent[] = [];
    for (let i = 0; i < SPELL_CAST.palmFall; i++) landed = e.step([cmd(e)]);
    expect(landed.some((v) => v.type === 'cast' && v.kind === 'meteor')).toBe(true);
    expect(s.fields[0]).toMatchObject({ radius: SPELL_LEVELS.incense[0].radius, life: SPELL_LEVELS.incense[0].life });
    expect(p.spells[1].cd).toBe(SPELL_LEVELS.palm[0].cooldown - SPELL_CAST.palmFall);
  });

  it('shortens cooldowns with Calm Mind and waits briefly when nothing is in reach', () => {
    const e = quiet();
    const p = e.state.players[0];
    p.passives = [{ id: 'calm', level: 5 }];
    p.spells = [{ id: 'incense', level: 1, cd: 1, evolved: false }, { id: 'bolt', level: 1, cd: 1, evolved: false }];
    e.step([cmd(e)]);
    expect(p.spells[0].cd).toBe(Math.trunc((SPELL_LEVELS.incense[0].cooldown * 60) / 100));
    expect(p.spells[1].cd).toBeLessThan(SPELL_LEVELS.bolt[0].cooldown / 2);
  });

  it('raises the Golden Bell, which takes a blow and breaks in a blast', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.kickCd = 1e6;
    p.spells = [{ id: 'bell', level: 1, cd: 1, evolved: false }];
    expect(e.step([cmd(e)]).map((v) => v.type)).toContain('bellUp');
    expect(p.bell).toBe(true);
    // the bell holds its charge, its cooldown frozen, until something reaches the hero
    for (let i = 0; i < 30; i++) e.step([cmd(e)]);
    expect(p.spells[0].cd).toBe(SPELL_LEVELS.bell[0].cooldown);
    p.hurtCd = 0;
    s.mobs.push(newMob(p.x, p.y), newMob(p.x + 200_000, p.y));
    const types = e.step([cmd(e)]).map((v) => v.type);
    expect(types).toContain('bellBreak');
    expect(types).not.toContain('hurt');
    expect(types.filter((t) => t === 'mobDown').length).toBe(2);
    expect(p).toMatchObject({ bell: false, hp: p.maxHp });
    expect(p.hurtCd).toBeGreaterThan(0);
  });

  it('throws cymbals one after another that pierce the horde, each hitting a target once', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.kickCd = 1e6;
    for (let i = 0; i < 5; i++) s.mobs.push(newMob(p.x + 300_000 + i * 150_000, p.y));
    s.elites = [newElite(p.x + 1_200_000, p.y)];
    s.elites[0].hp = s.elites[0].maxHp = 1e6;
    p.spells = [{ id: 'cymbal', level: 1, cd: 1, evolved: false }];
    e.step([cmd(e)]);
    expect(s.cymbals.length).toBe(SPELL_LEVELS.cymbal[0].count);
    // the first is on its way, the second still in the hero's hand
    expect(s.cymbals[0].x).toBeGreaterThan(p.x);
    expect(s.cymbals[1].x).toBe(p.x);
    p.spells[0].cd = 1e6;
    let down = 0;
    let eliteHits = 0;
    const flight = (SPELL_LEVELS.cymbal[0].life + SPELL_CAST.cymbalStagger) * (SPELL_CAST.cymbalBounces + 1);
    for (let i = 0; i < flight + 2; i++) {
      for (const v of e.step([cmd(e)])) {
        if (v.type === 'mobDown') down++;
        if (v.type === 'hit' && v.kind === 'elite') eliteHits++;
      }
    }
    expect(down).toBeGreaterThanOrEqual(5);
    expect(eliteHits).toBeGreaterThanOrEqual(1);
    expect(eliteHits).toBeLessThanOrEqual(SPELL_LEVELS.cymbal[0].count);
    expect(s.cymbals.length).toBe(0);
  });

  it('ricochets a cymbal off the enemy it was thrown at to the nearest one it has not hit', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.kickCd = 1e6;
    s.mobs.push(newMob(p.x + 400_000, p.y, 1e9), newMob(p.x + 400_000, p.y + 300_000, 1e9));
    p.spells = [{ id: 'cymbal', level: 1, cd: 1, evolved: false }];
    e.step([cmd(e)]);
    p.spells[0].cd = 1e6;
    s.cymbals.length = 1;
    const hit = new Set<number>();
    let clangs = 0;
    for (let i = 0; i < 40; i++) {
      for (const v of e.step([cmd(e)])) {
        if (v.type === 'hit') hit.add(v.index);
        if (v.type === 'clang') clangs++;
      }
    }
    expect([...hit].sort()).toEqual([0, 1]);
    expect(clangs).toBeGreaterThanOrEqual(1);
  });
});

describe('stats from outside the run', () => {
  it('start the hero with the bonus health and add under the passives', () => {
    const e = new Engine({ ...CHAPTER, bonus: { maxHp: 20, crit: 3 } });
    const p = e.state.players[0];
    expect(p.maxHp).toBe(Math.trunc((HERO.hp * 120) / 100));
    expect(p.hp).toBe(p.maxHp);
    expect(stat(p, 'crit')).toBe(3);
    p.passives.push({ id: 'wrath', level: 2 });
    expect(stat(p, 'crit')).toBe(3 + 2 * PASSIVES.wrath.perLevel);
  });

  it('grow every hit by the attack bonus', () => {
    const hits = (attack: number) => {
      const e = new Engine({ ...DEFAULT_RUN, mobs: 30, bonus: { attack } });
      let sum = 0;
      for (let i = 0; i < 300; i++) for (const ev of e.step([cmd(e)])) if (ev.type === 'hit') sum += ev.value;
      return sum;
    };
    expect(hits(50)).toBeGreaterThan(hits(0) * 1.3);
  });
});
