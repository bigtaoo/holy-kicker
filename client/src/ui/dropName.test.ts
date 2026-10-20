import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadLocale, LOCALES, setLocale, t, type Locale } from '../i18n';
import { ITEM_IDS, type Tier } from '../meta/gear';
import { dropName, itemName, tierName } from './gearText';

// Gear names in every language (the corgi's in dropName.corgi.test.ts): the word order and the
// tier's form come from the tables, so "Braçadeiras de Ferro Refinadas", not "Refinado Braçadeiras".

const TIERS: Tier[] = [0, 1, 2, 3, 4];

/** Every item takes a form each tier has, and a language's tiers all have as many forms. */
function expectFormsInEveryLanguage(): void {
  for (const l of LOCALES) {
    setLocale(l);
    const counts = new Set(TIERS.map((tier) => t(`tier.${tier}`).split('|').length));
    expect(counts.size, l).toBe(1);
    const [count] = [...counts];
    for (const item of ITEM_IDS) {
      const form = t(`gear.form.${item}`);
      expect(form, `${l} ${item}`).toMatch(/^\d$/);
      expect(Number(form), `${l} ${item}`).toBeLessThan(count!);
      if (count! > 1) expect(Number(form), `${l} ${item}`).toBeGreaterThan(0);
    }
  }
}

/** The name of `item` at `tier` in `locale`. */
function named(locale: Locale, item: (typeof ITEM_IDS)[number], tier: Tier): string {
  setLocale(locale);
  return dropName({ item, tier });
}

describe('dropName', () => {
  beforeAll(async () => {
    for (const l of LOCALES) expect(await loadLocale(l), l).toBe(true);
  });
  afterEach(() => setLocale('en'));

  it('has a form of every tier for every item', expectFormsInEveryLanguage);

  it('keeps English, Chinese, Japanese and Korean as the tier then the item', () => {
    for (const l of ['en', 'zh', 'ja', 'ko', 'tr'] as const) {
      setLocale(l);
      for (const item of ITEM_IDS) for (const tier of TIERS) expect(dropName({ item, tier })).toBe(`${tierName(tier)} ${itemName(item)}`);
    }
    expect(named('en', 'pendant', 2)).toBe('Refined Jade Pendant');
  });

  it('puts the tier after the item and makes it agree where the language does', () => {
    expect(named('pt', 'bracers', 2)).toBe('Braçadeiras de Ferro Refinadas');
    expect(named('pt', 'sash', 1)).toBe('Faixa de Seda Boa');
    expect(named('pt', 'robe', 1)).toBe('Manto Kasaya Bom');
    expect(named('es', 'robe', 4)).toBe('Túnica kasaya sagrada');
    expect(named('fr', 'sandals', 3)).toBe('Sandales de paille précieuses');
    expect(named('it', 'beads', 2)).toBe('Grani di Preghiera Raffinati');
    expect(named('vi', 'robe', 4)).toBe('Áo Cà Sa Thánh');
    expect(named('id', 'robe', 1)).toBe('Jubah Kasaya Bagus');
  });

  it('inflects the tier before the item in German, Russian and Polish', () => {
    expect(named('de', 'bracers', 1)).toBe('Feine Eisenarmschienen');
    expect(named('de', 'pendant', 2)).toBe('Edler Jadeanhänger');
    expect(named('ru', 'robe', 1)).toBe('Хорошая кашая');
    expect(named('ru', 'pendant', 4)).toBe('Священный нефритовый кулон');
    expect(named('ru', 'beads', 3)).toBe('Ценные чётки');
    expect(named('pl', 'robe', 1)).toBe('Dobra Szata Kasaya');
  });

  it('names a tier standing alone as before', () => {
    setLocale('pt');
    expect(tierName(1)).toBe('Bom');
    setLocale('ru');
    expect(tierName(1)).toBe('Хорошее');
    setLocale('de');
    expect(tierName(1)).toBe('Fein');
  });
});
