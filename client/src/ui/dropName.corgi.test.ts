import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadLocale, LOCALES, setLocale, t, type Locale } from '../i18n';
import { ITEM_IDS, type ItemId, type Tier } from '../meta/gear';
import { dropName, tierName } from './gearText';

// The corgi build's gear names (docs/reskin.md): its own items and tiers, so its own forms.

vi.mock('../theme', async (original) => ({ ...(await original<typeof import('../theme')>()), THEME: 'corgi' }));

function named(locale: Locale, item: ItemId, tier: Tier): string {
  setLocale(locale);
  return dropName({ item, tier });
}

describe('dropName in the corgi build', () => {
  beforeAll(async () => {
    for (const l of LOCALES) expect(await loadLocale(l), l).toBe(true);
  });
  afterEach(() => setLocale('en'));

  it('has a form of every tier for every item', () => {
    for (const l of LOCALES) {
      setLocale(l);
      const count = t('tier.0').split('|').length;
      for (const tier of [1, 2, 3, 4] as const) expect(t(`tier.${tier}`).split('|'), `${l} ${tier}`).toHaveLength(count);
      for (const item of ITEM_IDS) {
        const form = Number(t(`gear.form.${item}`));
        if (count === 1) expect(form, `${l} ${item}`).toBe(0);
        else expect(form > 0 && form < count, `${l} ${item} ${form}`).toBe(true);
      }
    }
  });

  it('reads naturally in every language', () => {
    expect(named('en', 'robe', 4)).toBe('Legendary Armour');
    expect(named('pt', 'robe', 1)).toBe('Armadura Boa');
    expect(named('pt', 'beads', 3)).toBe('Drones Orbitais Épicos');
    expect(named('es', 'bracers', 4)).toBe('Guanteletes legendarios');
    expect(named('fr', 'robe', 1)).toBe('Armure peu commune');
    expect(named('it', 'robe', 1)).toBe('Armatura Non Comune');
    expect(named('de', 'robe', 4)).toBe('Legendäre Rüstung');
    expect(named('ru', 'staff', 2)).toBe('Редкая плазменная сабля');
    expect(named('pl', 'bowl', 3)).toBe('Epicka Wyrzutnia Dysków');
    setLocale('pt');
    expect(tierName(1)).toBe('Bom');
  });
});
