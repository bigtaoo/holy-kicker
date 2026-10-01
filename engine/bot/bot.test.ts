import { describe, expect, it } from 'vitest';
import { playChapter } from './balance';

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

});
