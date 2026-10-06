import { afterEach, describe, expect, it } from 'vitest';
import { MAX_LEVEL, PASSIVE_IDS, SHRINE_IDS, SPELL_IDS, newPlayer, type Card } from '@hk/engine';
import { setLocale } from '../i18n';
import { cardText, sutraGoalText, sutraName } from './cardText';

describe('card text', () => {
  afterEach(() => setLocale('en'));

  it('describes a new spell and a spell level step with numbers', () => {
    const p = newPlayer(0, 0, 0);
    expect(cardText({ kind: 'spell', id: 'bolt' }, p)).toMatchObject({
      name: 'Vajra Bolt', tag: 'New!', fresh: true, lines: ['Lightning jumps through 5 enemies'],
    });
    expect(cardText({ kind: 'spell', id: 'bell' }, p).lines).toEqual(['Blocks a hit every 8s, then blasts']);
    p.spells.push({ id: 'cymbal', level: 1, cd: 0, evolved: false });
    expect(cardText({ kind: 'spell', id: 'cymbal' }, p).lines).toEqual(['Cymbals 2 → 3']);
    p.spells.push({ id: 'palm', level: 2, cd: 0, evolved: false });
    expect(cardText({ kind: 'spell', id: 'palm' }, p)).toMatchObject({
      tag: 'Lv 2 → 3', fresh: false, lines: ['Area +17%', 'Cooldown 3s → 2.5s'],
    });
  });

  it('describes relic steps and passives', () => {
    const p = newPlayer(0, 0, 0);
    expect(cardText({ kind: 'relic', id: 'ball' }, p).lines).toEqual(['Bounces 3 → 4']);
    p.relic = 3;
    expect(cardText({ kind: 'relic', id: 'ball' }, p).lines).toEqual(['Cooldown 0.9s → 0.7s']);
    expect(cardText({ kind: 'passive', id: 'rice' }, p).lines).toEqual(['Heal 0.4% health per second']);
    setLocale('zh');
    expect(cardText({ kind: 'passive', id: 'legs' }, p)).toMatchObject({ name: '罗汉腿', tag: '新！', lines: ['移动速度 +8%'] });
  });

  it('shows a passive\'s step as what it gives now and what it will give', () => {
    const p = newPlayer(0, 0, 0);
    p.passives = [{ id: 'rice', level: 3 }, { id: 'calm', level: 2 }, { id: 'karma', level: 1 }];
    expect(cardText({ kind: 'passive', id: 'rice' }, p)).toMatchObject({ tag: 'Lv 3 → 4', fresh: false, lines: ['Heal 1.2% → 1.6% health/s'] });
    expect(cardText({ kind: 'passive', id: 'calm' }, p).lines).toEqual(['Spell cooldown −16% → −24%']);
    expect(cardText({ kind: 'passive', id: 'karma' }, p).lines).toEqual(['XP +8% → +16%', 'Pickup range +15% → +30%']);
    setLocale('zh');
    expect(cardText({ kind: 'passive', id: 'rice' }, p).lines).toEqual(['每秒回复 1.2% → 1.6% 生命']);
  });

  it('describes the shrine cards', () => {
    const p = newPlayer(0, 0, 0);
    expect(cardText({ kind: 'shrine', id: 'heal' }, p)).toMatchObject({ name: 'Heal', lines: ['Restore 50% health'] });
    expect(cardText({ kind: 'shrine', id: 'offering' }, p).lines).toEqual(['Live to the next shrine or the end:', 'copper this run +30%']);
  });

  it('describes evolutions and the awakening as gold cards', () => {
    const p = newPlayer(0, 0, 0);
    expect(cardText({ kind: 'evolve', id: 'palm' }, p)).toMatchObject({
      kind: 'evolve', name: 'Mountain Palm', tag: 'Evolve!', lines: ['Stays and pins enemies 2s'],
    });
    expect(cardText({ kind: 'evolve', id: 'incense' }, p).lines).toEqual(['Heals 2.4% health/s inside']);
    expect(cardText({ kind: 'evolve', id: 'bell' }, p).lines).toEqual(['2s untouchable on breaking', 'Area +24%']);
    expect(cardText({ kind: 'evolve', id: 'ball' }, p)).toMatchObject({ name: 'Meteor Ball', tag: 'Awaken!' });
    setLocale('zh');
    expect(cardText({ kind: 'evolve', id: 'cymbal' }, p)).toMatchObject({ name: '钹轮', tag: '进化！', lines: ['4 片铜钹永远绕身旋转'] });
  });

  it('carries the item icon and what it evolves with', () => {
    const p = newPlayer(0, 0, 0);
    expect(cardText({ kind: 'spell', id: 'bell' }, p)).toMatchObject({ icon: 'bell', pairs: ['iron'] });
    expect(cardText({ kind: 'passive', id: 'legs' }, p)).toMatchObject({ icon: 'legs', pairs: ['ball'] });
    expect(cardText({ kind: 'evolve', id: 'palm' }, p)).toMatchObject({ icon: 'palm', pairs: [] });
    expect(cardText({ kind: 'shrine', id: 'heal' }, p).icon).toBeNull();
  });

  it('describes the staff, its level steps and its awakening', () => {
    const p = newPlayer(0, 0, 0, 100, 0, 'staff');
    const step = cardText({ kind: 'relic', id: 'staff' }, p);
    expect(step).toMatchObject({ name: 'Staff', icon: 'staff', pairs: ['iron'] });
    expect(step.lines[0]).toMatch(/^Reach \+\d+%$/);
    const awaken = cardText({ kind: 'evolve', id: 'staff' }, p);
    expect(awaken).toMatchObject({ name: 'Ruyi Staff', tag: 'Awaken!' });
    expect(awaken.lines).toEqual(['Sweeps all the way round', expect.stringMatching(/^Reach \+\d+%$/)]);
  });

  it('describes the wooden fish and its Stunning Bell', () => {
    const p = newPlayer(0, 0, 0, 100, 0, 'fish');
    expect(cardText({ kind: 'relic', id: 'fish' }, p)).toMatchObject({ name: 'Wooden Fish', icon: 'fish', pairs: ['calm'] });
    const awaken = cardText({ kind: 'evolve', id: 'fish' }, p);
    expect(awaken).toMatchObject({ name: 'Stunning Bell', tag: 'Awaken!' });
    expect(awaken.lines).toEqual(['Every 4th ring stuns for 1s', expect.stringMatching(/^Reach \+\d+%$/)]);
    setLocale('zh');
    expect(cardText({ kind: 'evolve', id: 'fish' }, p).lines[0]).toBe('每第 4 圈声波眩晕 1 秒');
  });

  it('describes the prayer beads and the 108 Beads', () => {
    const p = newPlayer(0, 0, 0, 100, 0, 'beads');
    const step = cardText({ kind: 'relic', id: 'beads' }, p);
    expect(step).toMatchObject({ name: 'Prayer Beads', icon: 'beads', pairs: ['eye'] });
    expect(step.lines).toEqual(['Beads 3 → 4']);
    p.relic = 2;
    expect(cardText({ kind: 'relic', id: 'beads' }, p).lines).toEqual(['Damage +29%', 'Spin +14%']);
    const awaken = cardText({ kind: 'evolve', id: 'beads' }, p);
    expect(awaken).toMatchObject({ name: '108 Beads', tag: 'Awaken!' });
    expect(awaken.lines).toEqual(['A second ring spins the other way', 'Beads 6 → 12']);
  });

  it('describes the alms bowl, the Bottomless Bowl and Karma', () => {
    const p = newPlayer(0, 0, 0, 100, 0, 'bowl');
    const step = cardText({ kind: 'relic', id: 'bowl' }, p);
    expect(step).toMatchObject({ name: 'Alms Bowl', icon: 'bowl', pairs: ['karma'] });
    expect(step.lines).toEqual(['Drags 3 → 4', 'Reach +8%']);
    const awaken = cardText({ kind: 'evolve', id: 'bowl' }, p);
    expect(awaken).toMatchObject({ name: 'Bottomless Bowl', tag: 'Awaken!' });
    expect(awaken.lines).toEqual(['Swallows 8 enemies a throw, XP at once', 'Reach +7%']);
    expect(cardText({ kind: 'passive', id: 'karma' }, p).lines).toEqual(['XP +8%, pickup range +15%']);
  });

  it('describes the sutra spells, their evolutions, Focus and the sutras', () => {
    const p = newPlayer(0, 0, 0);
    expect(cardText({ kind: 'spell', id: 'lotus' }, p).lines).toEqual(['Walking sows lotus seeds that bloom under enemies']);
    p.spells = [{ id: 'lotus', level: 1, cd: 0, evolved: false }, { id: 'halo', level: 2, cd: 0, evolved: false }];
    expect(cardText({ kind: 'spell', id: 'lotus' }, p).lines).toEqual(['Cooldown 0.6s → 0.5s']);
    // the halo's shorter turn reads as a faster spin
    expect(cardText({ kind: 'spell', id: 'halo' }, p).lines).toEqual(['Spin +14%', 'Damage +20%']);
    expect(cardText({ kind: 'evolve', id: 'halo' }, p).lines).toEqual(['3 beams turn around you', 'Area +8%']);
    const roar = cardText({ kind: 'evolve', id: 'roar' }, p);
    expect(roar).toMatchObject({ name: 'Thunder Roar', tag: 'Evolve!' });
    expect(roar.lines).toEqual(['Roars all round, shatters bullets', 'Area +8%', 'Damage +12%']);
    expect(cardText({ kind: 'passive', id: 'focus' }, p).lines).toEqual(['Spell duration +10%, guard after a hit +20%']);
    expect(sutraName('roar')).toBe("Lion's Roar");
    expect(sutraName('focus')).toBe('Focus');
    expect(sutraGoalText('lotus')).toBe('Reach wave 25 in a chapter');
  });

  it('has a name and at least one line for every card at every level', () => {
    const p = newPlayer(0, 0, 0);
    const cards: Card[] = [
      { kind: 'relic', id: 'ball' },
      { kind: 'relic', id: 'staff' },
      { kind: 'relic', id: 'fish' },
      { kind: 'relic', id: 'beads' },
      { kind: 'relic', id: 'bowl' },
      ...SPELL_IDS.map((id): Card => ({ kind: 'spell', id })),
      ...PASSIVE_IDS.map((id): Card => ({ kind: 'passive', id })),
      ...SHRINE_IDS.map((id): Card => ({ kind: 'shrine', id })),
      ...['ball', 'staff', 'fish', 'beads', 'bowl', ...SPELL_IDS].map((id): Card => ({ kind: 'evolve', id })),
    ];
    for (let level = 1; level < MAX_LEVEL; level++) {
      p.relic = level;
      p.spells = SPELL_IDS.map((id) => ({ id, level, cd: 0, evolved: false }));
      p.passives = PASSIVE_IDS.map((id) => ({ id, level }));
      for (const c of cards) {
        const text = cardText(c, p);
        expect(text.name).not.toMatch(/\./);
        expect(text.lines.length).toBeGreaterThan(0);
        for (const l of text.lines) expect(l).not.toMatch(/[{}]/);
      }
    }
  });
});
