import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { rawOnTour, tourScreens } from '../testkit/screenTour';

afterEach(() => setLocale('en'));

describe('every screen in words, no key left raw (monk)', () => {
  for (const locale of ['en', 'zh'] as const) {
    it(locale, async () => {
      setLocale(locale);
      const tour = await tourScreens();
      expect(rawOnTour(tour)).toEqual({});
      for (const [screen, texts] of Object.entries(tour)) expect(texts.length, screen).toBeGreaterThan(0);
    }, 30_000);
  }
});
