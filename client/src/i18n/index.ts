import { THEME } from '../theme';
import { CORGI, CORGI_MORE } from './corgi';
import { en } from './en';
import { MORE, MORE_NAMES } from './more';
import { overlay } from './overlay';
import { zh } from './zh';

// String tables (docs/design.md "Localization"). English is the source: every other table is
// typed as Table<typeof en>, so a missing or extra key is a compile error. Keys are dotted
// paths checked at compile time: t('lobby.play').

export type Locale = 'en' | 'zh' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'pl' | 'ru' | 'ja' | 'ko' | 'vi' | 'tr' | 'th' | 'id';
const ALL: readonly Locale[] = ['en', 'zh', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'ja', 'ko', 'vi', 'tr', 'th', 'id'];
export const DEFAULT_LOCALE: Locale = 'en';

export type Table<T> = { [K in keyof T]: T[K] extends string ? string : Table<T[K]> };

type Paths<T> = {
  [K in keyof T & (string | number)]: T[K] extends string ? `${K}` : `${K}.${Paths<T[K]>}`;
}[keyof T & (string | number)];

export type Key = Paths<typeof en>;

/**
 * The theme's own words (docs/reskin.md): under the corgi theme its tables (i18n/corgi) replace
 * the base strings key for key. A monk build folds this to null and ships no corgi text.
 */
const THEMED = THEME === 'corgi' ? { now: CORGI, more: CORGI_MORE } : null;

/** The tables in hand: en and zh always, the others once loadLocale fetched them. */
const TABLES: Partial<Record<Locale, Table<typeof en>>> = { en: overlay(en, THEMED?.now.en), zh: overlay(zh, THEMED?.now.zh) };
/** The languages this build ships (WeChat: en and zh only, i18n/more.ts), in the picker's order. */
export const LOCALES: readonly Locale[] = ALL.filter((l) => TABLES[l] || MORE[l]);

/**
 * Fetches `locale`'s table if it is not in hand yet; resolves whether it is (false when the fetch
 * failed, offline say: the caller stays in the language it had). Until then t() reads English.
 */
export async function loadLocale(locale: Locale): Promise<boolean> {
  if (TABLES[locale]) return true;
  const load = MORE[locale];
  if (!load) return false;
  try {
    const [table, over] = await Promise.all([load(), THEMED?.more[locale]?.()]);
    TABLES[locale] = overlay(table, over);
    return true;
  } catch {
    return false;
  }
}

let current: Locale = DEFAULT_LOCALE;

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/**
 * The first supported language in a preference list (navigator.languages, the portal's
 * language, WeChat's 'zh_CN'); only the base subtag counts ('in', Indonesian's old code, reads as
 * 'id'). English when nothing matches.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const raw = tag.split(/[-_]/)[0]?.toLowerCase();
    const base = raw === 'in' ? 'id' : raw;
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

function lookup(key: string, locale: Locale): string {
  let node: unknown = TABLES[locale] ?? TABLES.en;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : key;
}

/**
 * The text for `key` in the current locale, with {name} placeholders filled from `vars`;
 * {name:lower} starts the value with a small letter, for a name inside a phrase.
 */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const text = lookup(key, current);
  if (!vars) return text;
  return text.replace(/\{(\w+)(:lower)?\}/g, (whole, name: string, lower?: string) => {
    if (!(name in vars)) return whole;
    const v = String(vars[name]);
    return lower ? v.charAt(0).toLocaleLowerCase(current) + v.slice(1) : v;
  });
}

/** A language's own name for itself, for the language picker. */
export function localeName(locale: Locale): string {
  return TABLES[locale]?.lang.name ?? MORE_NAMES[locale] ?? en.lang.name;
}

/**
 * A compact amount for the top bar: 950, 12.3k, 4.5M in English (and the other European
 * languages); 950, 1.2万, 3.4亿 in Chinese, the same in Japanese (万, 億) and Korean (만, 억).
 * Below the first step the number is exact.
 */
const STEPS: Partial<Record<Locale, [number, string][]>> = {
  zh: [[1e8, '亿'], [1e4, '万']],
  ja: [[1e8, '億'], [1e4, '万']],
  ko: [[1e8, '억'], [1e4, '만']],
};

export function formatAmount(n: number, locale: Locale = current): string {
  const v = Math.floor(n);
  const steps = STEPS[locale] ?? [[1e6, 'M'], [1e3, 'k']];
  for (const [size, suffix] of steps) {
    if (v >= size * 10) return `${Math.floor(v / size)}${suffix}`;
    if (v >= size) return `${Math.floor((v / size) * 10) / 10}${suffix}`;
  }
  return String(v);
}
