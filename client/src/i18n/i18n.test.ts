import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { id } from './id';
import { it as italian } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { pl } from './pl';
import { pt } from './pt';
import { ru } from './ru';
import { th } from './th';
import { tr } from './tr';
import { vi } from './vi';
import { en } from './en';
import { MORE_NAMES } from './more';
import { zh } from './zh';
import { detectLocale, formatAmount, loadLocale, LOCALES, localeName, pluralCategory, setLocale, t } from './index';

const TABLES = { en, zh, de, es, fr, id, it: italian, ja, ko, pl, pt, ru, th, tr, vi };

function leaves(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`)));
}

describe('i18n', () => {
  beforeAll(async () => {
    for (const l of LOCALES) expect(await loadLocale(l), l).toBe(true);
  });
  afterEach(() => setLocale('en'));

  it("names every language before its table is fetched, as the table does", () => {
    for (const [l, name] of Object.entries(MORE_NAMES)) expect(name, l).toBe(TABLES[l as keyof typeof TABLES].lang.name);
    expect(Object.keys(MORE_NAMES).sort()).toEqual(LOCALES.filter((l) => l !== 'en' && l !== 'zh').sort());
  });

  it('ships fifteen languages, each named in itself', () => {
    expect(LOCALES).toEqual(['en', 'zh', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'ja', 'ko', 'vi', 'tr', 'th', 'id']);
    expect(new Set(LOCALES.map(localeName)).size).toBe(LOCALES.length);
  });

  it('every table has the same keys and no empty strings', () => {
    for (const l of LOCALES) {
      expect(leaves(TABLES[l]!).sort(), l).toEqual(leaves(en).sort());
      setLocale(l);
      for (const key of leaves(en)) expect(t(key as never), `${l} ${key}`).not.toBe('');
    }
  });

  it('keeps the same placeholders in every language', () => {
    const holes = (s: string) => [...new Set(s.match(/\{\w+(?=[:}|])/g) ?? [])].sort().join();
    setLocale('en');
    const english = leaves(en).map((k) => holes(t(k as never)));
    for (const l of LOCALES) {
      setLocale(l);
      expect(leaves(en).map((k) => `${k} ${holes(t(k as never))}`), l).toEqual(leaves(en).map((k, i) => `${k} ${english[i]}`));
    }
  });

  it('keeps sixteen words a side for the board names', () => {
    for (const l of LOCALES) {
      setLocale(l);
      expect(t('board.adjs').split('|'), l).toHaveLength(16);
      expect(t('board.nouns').split('|'), l).toHaveLength(16);
    }
  });

  it('fills placeholders and switches language', () => {
    expect(t('lobby.best', { wave: 37 })).toBe('Best: wave 37');
    setLocale('zh');
    expect(t('lobby.best', { wave: 37 })).toBe('最佳：第 37 波');
    expect(t('chapter.1')).toBe('荒寺');
  });

  it('detects the language from a preference list', () => {
    expect(detectLocale(['nl-NL', 'zh-CN'])).toBe('zh');
    expect(detectLocale(['zh_CN'])).toBe('zh');
    expect(detectLocale(['de-DE', 'en'])).toBe('de');
    expect(detectLocale(['pt-BR'])).toBe('pt');
    expect(detectLocale(['vi-VN'])).toBe('vi');
    expect(detectLocale(['in-ID'])).toBe('id');
    expect(detectLocale(['nl'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('formats amounts compactly per language', () => {
    expect(formatAmount(950, 'en')).toBe('950');
    expect(formatAmount(1234, 'en')).toBe('1.2K');
    expect(formatAmount(12345, 'en')).toBe('12K');
    expect(formatAmount(4_560_000, 'en')).toBe('4.5M');
    expect(formatAmount(9999, 'zh')).toBe('9999');
    expect(formatAmount(12345, 'zh')).toBe('1.2万');
    expect(formatAmount(340_000_000, 'zh')).toBe('3.4亿');
    expect(formatAmount(12345, 'ja')).toBe('1.2万');
    expect(formatAmount(12345, 'ko')).toBe('1.2만');
    expect(formatAmount(4_560_000, 'de').replace(/\s/g, ' ')).toBe('4,5 Mio.');
    expect(formatAmount(1234, 'fr').replace(/\s/g, ' ')).toBe('1,2 k');
  });

  it('picks the plural form by the language rules', () => {
    expect(pluralCategory(1, 'en')).toBe('one');
    expect(pluralCategory(3, 'ru')).toBe('few');
    expect(pluralCategory(5, 'ru')).toBe('many');
    expect(pluralCategory(22, 'pl')).toBe('few');
    expect(pluralCategory(0, 'fr')).toBe('one');
    expect(t('challenge.streak', { n: 1 })).toBe('Daily streak: 1 day');
    expect(t('challenge.streak', { n: 3 })).toBe('Daily streak: 3 days');
    setLocale('ru');
    expect(t('challenge.streak', { n: 2 })).toMatch(/2 дня$/);
    expect(t('challenge.streak', { n: 5 })).toMatch(/5 дней$/);
    expect(t('challenge.streak', { n: 21 })).toMatch(/21 день$/);
    setLocale('pl');
    expect(t('challenge.streak', { n: 3 })).toMatch(/3 dni$/);
    setLocale('fr');
    expect(t('patrol.quickInfo', { copper: 5, n: 1 })).not.toMatch(/1 équipements/);
  });

  it('writes every plural form a language needs', () => {
    for (const l of LOCALES) {
      setLocale(l);
      // fr/es/it/pt's `many` is for millions only; their `other` serves.
      const needs = new Intl.PluralRules(l).resolvedOptions().pluralCategories.filter((c) => c !== 'other' && (c !== 'many' || l === 'pl' || l === 'ru'));
      for (const key of leaves(en)) {
        for (const m of t(key as never).matchAll(/\{\w+\|([^{}]+)\}/g)) {
          const forms = m[1]!.split('|').map((f) => f.split(':')[0]);
          expect(forms, `${l} ${key}`).toContain('other');
          for (const c of needs) expect(forms, `${l} ${key} ${c}`).toContain(c);
        }
      }
    }
  });
});
