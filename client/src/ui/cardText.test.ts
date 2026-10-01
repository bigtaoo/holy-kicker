import { afterEach, describe, expect, it } from 'vitest';
import { MAX_LEVEL, PASSIVE_IDS, SPELL_IDS, newPlayer, type Card } from '@hk/engine';
import { setLocale } from '../i18n';
import { cardText } from './cardText';

describe('card text', () => {
  afterEach(() => setLocale('en'));

  it('describes a new spell and a spell level step with numbers', () => {
    const p = newPlayer(0, 0, 0);
    expect(cardText({ kind: 'spell', id: 'bolt' }, p)).toMatchObject({
      name: 'Vajra Bolt', tag: 'New!', fresh: true, lines: ['Lightning jumps through 5 enemies'],
    });
    expect(cardText({ kind: 'spell', id: 'bell' }, p).lines).toEqual(['Blocks a hit every 8s, then blasts']);
    p.spells.push({ id: 'cymbal', level: 1, cd: 0 });
    expect(cardText({ kind: 'spell', id: 'cymbal' }, p).lines).toEqual(['Cymbals 2 → 3']);
    p.spells.push({ id: 'palm', level: 2, cd: 0 });
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

  it('has a name and at least one line for every card at every level', () => {
    const p = newPlayer(0, 0, 0);
    const cards: Card[] = [
      { kind: 'relic', id: 'ball' },
      ...SPELL_IDS.map((id): Card => ({ kind: 'spell', id })),
      ...PASSIVE_IDS.map((id): Card => ({ kind: 'passive', id })),
    ];
    for (let level = 1; level < MAX_LEVEL; level++) {
      p.relic = level;
      p.spells = SPELL_IDS.map((id) => ({ id, level, cd: 0 }));
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
