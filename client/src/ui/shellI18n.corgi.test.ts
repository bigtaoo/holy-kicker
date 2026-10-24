import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { THEME } from '../theme';
import { rawOnTour, tourScreens } from '../testkit/screenTour';

// the corgi build's words and art (client/themes/corgi.json), as `npm run build:new` makes it
vi.mock('../theme', async (original) => ({ ...(await original<typeof import('../theme')>()), THEME: 'corgi' }));

afterEach(() => setLocale('en'));

describe('every screen in words, no key left raw (corgi)', () => {
  for (const locale of ['en', 'zh'] as const) {
    it(locale, async () => {
      expect(THEME).toBe('corgi');
      setLocale(locale);
      const tour = await tourScreens();
      expect(rawOnTour(tour)).toEqual({});
      for (const [screen, texts] of Object.entries(tour)) expect(texts.length, screen).toBeGreaterThan(0);
    }, 30_000);
  }
});
