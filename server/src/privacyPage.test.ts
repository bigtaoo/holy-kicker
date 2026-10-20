import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pageGame, privacyPage } from './privacyPage';

const page = (lang: 'en' | 'zh') => readFileSync(new URL(`./privacy.${lang}.html`, import.meta.url), 'utf8');

describe('privacy page per game', () => {
  it('reads the game from ?g=, Holy Kicker otherwise', () => {
    expect(pageGame(new URLSearchParams('g=corgi&lang=zh'))).toBe('corgi');
    expect(pageGame(new URLSearchParams('lang=zh'))).toBe('monk');
    expect(pageGame(new URLSearchParams('g=nope'))).toBe('monk');
  });

  it("serves Holy Kicker's pages as written", () => {
    for (const lang of ['en', 'zh'] as const) expect(privacyPage(page(lang), lang, 'monk')).toBe(page(lang));
  });

  it("names only the corgi's game on its page, and keeps its language link on it", () => {
    for (const lang of ['en', 'zh'] as const) {
      const corgi = privacyPage(page(lang), lang, 'corgi');
      expect(corgi).not.toMatch(/Holy Kicker|蹴鞠僧|武僧|\bmonk/i);
      expect(corgi).toContain(lang === 'en' ? 'Corgi Commando' : '柯基突击队');
      expect(corgi).toContain(`?g=corgi&amp;lang=${lang === 'en' ? 'zh' : 'en'}`);
    }
  });
});
