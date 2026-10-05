import { describe, expect, it } from 'vitest';
import { setLocale, t } from '../i18n';
import { clearLine, waveLine } from './story';

describe('story', () => {
  it('speaks before the mid-boss and the boss, and after the mid-boss on the next wave', () => {
    expect(waveLine(1, 24, 50)).toBeNull();
    expect(waveLine(1, 25, 50)).toEqual({ who: 'story.monk', say: 'story.c1.midBefore' });
    expect(waveLine(1, 26, 50)).toEqual({ who: 'story.monk', say: 'story.c1.midAfter' });
    expect(waveLine(3, 25, 50)).toEqual({ who: 'boss.carpEmpowered', say: 'story.c3.midBefore' });
    expect(waveLine(5, 50, 50)).toEqual({ who: 'boss.demon', say: 'story.c5.bossBefore' });
    expect(waveLine(4, 27, 50)).toBeNull();
    expect(clearLine(2)).toEqual({ who: 'story.monk', say: 'story.c2.bossAfter' });
  });

  it('has every line in both languages', () => {
    for (const locale of ['en', 'zh'] as const) {
      setLocale(locale);
      for (let c = 1; c <= 5; c++) {
        for (const line of [waveLine(c, 25, 50), waveLine(c, 26, 50), waveLine(c, 50, 50), clearLine(c)]) {
          expect(t(line!.say)).not.toBe(line!.say);
          expect(t(line!.who)).not.toBe(line!.who);
        }
      }
    }
    setLocale('en');
  });
});
