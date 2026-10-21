import { describe, expect, it } from 'vitest';
import { newPlayer } from '../state';
import { playChapter } from './balance';
import { suggestCard } from './bot';

// The balance bots: they must play through the real rules (picking cards, dying, winning)
// and do so reproducibly, or the report (npm run balance) means nothing.

describe('balance bots', () => {
  it('plays a short chapter to an end, the same way every time', () => {
    const a = playChapter(3, 'skilled', 4);
    expect(a.outcome).not.toBe('timeout');
    expect(a.level).toBeGreaterThan(1);
    expect(a.build).toMatch(/^ball\d/);
    expect(playChapter(3, 'skilled', 4)).toEqual(a);
  });

  it('suggests a spell over a passive, the lower level on a tie', () => {
    const p = newPlayer(0, 0, 0);
    p.spells.push({ id: 'bolt', level: 2, cd: 0, evolved: false }, { id: 'cymbal', level: 1, cd: 0, evolved: false });
    p.offer = [{ kind: 'passive', id: 'calm' }, { kind: 'spell', id: 'bolt' }, { kind: 'spell', id: 'cymbal' }];
    expect(suggestCard(p)).toBe(2);
    p.offer = [{ kind: 'spell', id: 'bolt' }, { kind: 'evolve', id: 'bolt' }];
    expect(suggestCard(p)).toBe(1);
    p.hp = 10;
    p.offer = [{ kind: 'shrine', id: 'insight' }, { kind: 'shrine', id: 'heal' }];
    expect(suggestCard(p)).toBe(1);
  });
});
