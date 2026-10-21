import { describe, expect, it } from 'vitest';
import { setLocale, t } from '../i18n';
import { clearLine, waveLine } from './story';

describe('story', () => {
  it('speaks before the first mid-boss and the boss, and after the mid-boss on the next wave', () => {
    expect(waveLine(1, 19, 50)).toBeNull();
    expect(waveLine(1, 20, 50)).toEqual({ who: 'story.monk', say: 'story.c1.midBefore' });
    expect(waveLine(1, 21, 50)).toEqual({ who: 'story.monk', say: 'story.c1.midAfter' });
    expect(waveLine(3, 20, 50)).toEqual({ who: 'boss.carpEmpowered', say: 'story.c3.midBefore' });
    expect(waveLine(5, 50, 50)).toEqual({ who: 'boss.demon', say: 'story.c5.bossBefore' });
    expect(waveLine(4, 22, 50)).toBeNull();
    // the second mid-boss comes without lines
    expect(waveLine(1, 35, 50)).toBeNull();
    expect(waveLine(1, 36, 50)).toBeNull();
    expect(clearLine(2, 50, 50)).toEqual({ who: 'story.monk', say: 'story.c2.bossAfter' });
  });

  it("pushes the story on in the later acts, spoken by the map's foes, but none for the Inner Demon as the temple's mid-boss", () => {
    expect(waveLine(1, 1, 50)).toBeNull();
    expect(waveLine(6, 1, 50)).toEqual({ who: 'story.monk', say: 'story.a2.open' });
    expect(waveLine(11, 1, 50)).toEqual({ who: 'boss.demon', say: 'story.a3.open' });
    expect(waveLine(7, 20, 50)).toEqual({ who: 'boss.empowered', say: 'story.a2.midBefore' });
    expect(waveLine(12, 21, 50)).toEqual({ who: 'story.monk', say: 'story.a3.midAfter' });
    expect(waveLine(6, 20, 50)).toBeNull();
    expect(waveLine(6, 21, 50)).toBeNull();
    expect(waveLine(6, 50, 50)).toEqual({ who: 'boss.abbot', say: 'story.a2.bossBefore' });
    // the rush's leader speaks first in act 4, the demon in the last chapter
    expect(waveLine(16, 50, 50)).toEqual({ who: 'boss.carp', say: 'story.a4.bossBefore' });
    expect(clearLine(17, 50, 50)).toEqual({ who: 'story.monk', say: 'story.a4.bossAfter' });
    expect(waveLine(20, 50, 50)).toEqual({ who: 'boss.demon', say: 'story.finale.bossBefore' });
    expect(clearLine(20, 50, 50)).toEqual({ who: 'story.monk', say: 'story.finale.bossAfter' });
  });

  it('gives a run that ends on the mid-boss its mid-boss lines, not the chapter boss lines', () => {
    expect(waveLine(2, 20, 20)).toEqual({ who: 'boss.empowered', say: 'story.c2.midBefore' });
    expect(waveLine(2, 35, 35)).toBeNull();
    expect(clearLine(2, 20, 20)).toEqual({ who: 'story.monk', say: 'story.c2.midAfter' });
  });

  it('has every line in both languages', () => {
    for (const locale of ['en', 'zh'] as const) {
      setLocale(locale);
      for (let c = 1; c <= 20; c++) {
        for (const line of [waveLine(c, 1, 50), waveLine(c, 20, 50), waveLine(c, 21, 50), waveLine(c, 50, 50), clearLine(c, 50, 50)]) {
          if (!line) continue;
          expect(t(line!.say)).not.toBe(line!.say);
          expect(t(line!.who)).not.toBe(line!.who);
        }
      }
    }
    setLocale('en');
  });
});
