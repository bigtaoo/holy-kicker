import { describe, expect, it } from 'vitest';
import { newPlayer } from '../state';
import { playChapter } from './balance';
import { steerScore, suggestCard } from './bot';

// The balance bots: they must play through the real rules (picking cards, dying, winning)
// and do so reproducibly, or the report (npm run balance) means nothing.

describe('balance bots', () => {
  // two whole chapters: well under a second here, but past vitest's 5 s on a CI runner under coverage
  it('plays a short chapter to an end, the same way every time', { timeout: 30_000 }, () => {
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

  it("steers a new player to the healing incense, its rice once, and healing when hurt", () => {
    const p = newPlayer(0, 0, 0);
    p.spells.push({ id: 'bolt', level: 2, cd: 0, evolved: false }, { id: 'incense', level: 1, cd: 0, evolved: false });
    p.offer = [{ kind: 'spell', id: 'cymbal' }, { kind: 'passive', id: 'rice' }, { kind: 'spell', id: 'incense' }];
    expect(suggestCard(p)).toBe(0);
    expect(suggestCard(p, true)).toBe(2);
    p.offer = [{ kind: 'spell', id: 'cymbal' }, { kind: 'passive', id: 'rice' }, { kind: 'spell', id: 'bolt' }];
    expect(suggestCard(p, true)).toBe(1);
    // the rice once: owned, it is a passive like any other
    p.passives.push({ id: 'rice', level: 1 });
    expect(suggestCard(p, true)).toBe(0);
    // below half health whatever heals comes first
    p.hp = Math.trunc(p.maxHp / 2) - 1;
    expect(suggestCard(p, true)).toBe(1);
    p.offer = [{ kind: 'passive', id: 'rice' }, { kind: 'evolve', id: 'incense' }, { kind: 'evolve', id: 'bolt' }];
    expect(suggestCard(p, true)).toBe(1);
    expect(steerScore(p, { kind: 'evolve', id: 'bolt' })).toBe(120);
  });
});
