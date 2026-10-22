import { THEME } from '../theme';
import { CORGI } from './corgi';
import { MORE as CORGI_MORE } from './corgi/more';
import { en } from './en';
import { MONK } from './monk';
import type { monkEn } from './monk/en';
import { MORE as MONK_MORE } from './monk/more';
import { MORE, MORE_NAMES } from './more';
import { type Merge, overlay } from './overlay';
import { zh } from './zh';

// String tables (docs/design.md "Localization"). English is the source: every other table is
// typed as Table<typeof en>, so a missing or extra key is a compile error. Keys are dotted
// paths checked at compile time: t('lobby.play'). The strings that name a game's world are not
// here but in its theme's tables (i18n/monk, i18n/corgi; docs/reskin.md "Words"), typed the
// same way after monk/en.ts; a build carries its own theme's and never the other's.

export type Locale = 'en' | 'zh' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'pl' | 'ru' | 'ja' | 'ko' | 'vi' | 'tr' | 'th' | 'id';
const ALL: readonly Locale[] = ['en', 'zh', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'ja', 'ko', 'vi', 'tr', 'th', 'id'];
export const DEFAULT_LOCALE: Locale = 'en';

export type Table<T> = { [K in keyof T]: T[K] extends string ? string : Table<T[K]> };

type Paths<T> = {
  [K in keyof T & (string | number)]: T[K] extends string ? `${K}` : `${K}.${Paths<T[K]>}`;
}[keyof T & (string | number)];

/** A whole table: the shared strings and the theme's. */
type Full = Table<Merge<typeof en, typeof monkEn>>;

export type Key = Paths<Full>;

/** The theme's own words: the build folds the choice, so the other theme's are left out. */
const THEMED = THEME === 'corgi' ? { now: CORGI, more: CORGI_MORE } : { now: MONK, more: MONK_MORE };

/** The tables in hand: en and zh always, the others once loadLocale fetched them. */
const TABLES: Partial<Record<Locale, Full>> = { en: overlay(en, THEMED.now.en), zh: overlay(zh, THEMED.now.zh) };
/** The languages this build ships (WeChat: en and zh only, i18n/more.ts), in the picker's order. */
export const LOCALES: readonly Locale[] = ALL.filter((l) => TABLES[l] || MORE[l]);

/**
 * Fetches `locale`'s table if it is not in hand yet; resolves whether it is (false when the fetch
 * failed, offline say: the caller stays in the language it had). Until then t() reads English.
 */
export async function loadLocale(locale: Locale): Promise<boolean> {
  if (TABLES[locale]) return true;
  const load = MORE[locale];
  const words = THEMED.more[locale];
  if (!load || !words) return false;
  try {
    const [table, own] = await Promise.all([load(), words()]);
    TABLES[locale] = overlay(table, own);
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
 * {name:lower} starts the value with a small letter, for a name inside a phrase, and
 * {n|one:day|other:days} picks the word for the count `n` by the language's plural rules
 * (few and many too, for Polish or Russian; a missing form reads `other`).
 */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const text = lookup(key, current);
  if (!vars) return text;
  return text
    .replace(/\{(\w+)\|([^{}]+)\}/g, (whole, name: string, forms: string) => (name in vars ? pluralForm(forms, Number(vars[name]), current) : whole))
    .replace(/\{(\w+)(:lower)?\}/g, (whole, name: string, lower?: string) => {
      if (!(name in vars)) return whole;
      const v = String(vars[name]);
      return lower ? v.charAt(0).toLocaleLowerCase(current) + v.slice(1) : v;
    });
}

const RULES: Partial<Record<Locale, Intl.PluralRules | null>> = {};

/** `n`'s plural category in `locale`; English's rule where Intl.PluralRules is missing (old WeChat). */
export function pluralCategory(n: number, locale: Locale): string {
  if (RULES[locale] === undefined) {
    try {
      RULES[locale] = typeof Intl !== 'undefined' && Intl.PluralRules ? new Intl.PluralRules(locale) : null;
    } catch {
      RULES[locale] = null;
    }
  }
  return RULES[locale]?.select(n) ?? (n === 1 ? 'one' : 'other');
}

/** The form for `n` out of "one:day|other:days". */
function pluralForm(forms: string, n: number, locale: Locale): string {
  const table = new Map<string, string>();
  for (const part of forms.split('|')) {
    const at = part.indexOf(':');
    if (at > 0) table.set(part.slice(0, at), part.slice(at + 1));
  }
  return table.get(pluralCategory(n, locale)) ?? table.get('other') ?? '';
}

/** A language's own name for itself, for the language picker. */
export function localeName(locale: Locale): string {
  return TABLES[locale]?.lang.name ?? MORE_NAMES[locale] ?? en.lang.name;
}

/**
 * A compact amount for the top bar in the language's own style (12.3K, 1,2 k, 4,5 Mio., 1.2万),
 * from Intl.NumberFormat; one decimal below ten of a unit, none above. Where Intl has no compact
 * notation (old WeChat) English's k and M, and 万/亿 in Chinese, Japanese (万, 億) and Korean
 * (만, 억). Below the first step the number is exact.
 */
const STEPS: Partial<Record<Locale, [number, string][]>> = {
  zh: [[1e8, '亿'], [1e4, '万']],
  ja: [[1e8, '億'], [1e4, '万']],
  ko: [[1e8, '억'], [1e4, '만']],
};

const COMPACT: Partial<Record<Locale, [Intl.NumberFormat, Intl.NumberFormat] | null>> = {};

function compact(locale: Locale): [Intl.NumberFormat, Intl.NumberFormat] | null {
  if (COMPACT[locale] === undefined) {
    try {
      const make = (digits: number) =>
        new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: digits, roundingMode: 'trunc' } as Intl.NumberFormatOptions);
      const pair: [Intl.NumberFormat, Intl.NumberFormat] = [make(1), make(0)];
      // An engine that ignores `notation` prints the whole number: treat it as having none.
      COMPACT[locale] = /[^\d\s.,]/.test(pair[0].format(12345e3)) ? pair : null;
    } catch {
      COMPACT[locale] = null;
    }
  }
  return COMPACT[locale] ?? null;
}

export function formatAmount(n: number, locale: Locale = current): string {
  const v = Math.floor(n);
  const f = v >= 1000 ? compact(locale) : null;
  if (f) {
    const integer = f[0].formatToParts(v).filter((p) => p.type === 'integer').map((p) => p.value).join('');
    return (integer.length >= 2 ? f[1] : f[0]).format(v);
  }
  const steps = STEPS[locale] ?? [[1e6, 'M'], [1e3, 'k']];
  for (const [size, suffix] of steps) {
    if (v >= size * 10) return `${Math.floor(v / size)}${suffix}`;
    if (v >= size) return `${Math.floor((v / size) * 10) / 10}${suffix}`;
  }
  return String(v);
}
