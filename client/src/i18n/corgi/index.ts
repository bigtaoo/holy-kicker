import type { en } from '../en';
import type { Locale } from '../index';
import type { Override } from '../overlay';
import { corgiEn } from './en';
import { corgiZh } from './zh';

// The corgi theme's words (docs/reskin.md), laid over the base tables by i18n/index.ts in a
// corgi build only. Like the base tables, en and zh come in the bundle and the other languages
// are fetched with their base table (i18n/more.ts).
type Words = Override<typeof en>;

export const CORGI: Partial<Record<Locale, Words>> = { en: corgiEn, zh: corgiZh };

export const CORGI_MORE: Partial<Record<Locale, () => Promise<Words>>> = {
  de: () => import('./de').then((m) => m.corgiDe),
  fr: () => import('./fr').then((m) => m.corgiFr),
  es: () => import('./es').then((m) => m.corgiEs),
  it: () => import('./it').then((m) => m.corgiIt),
  pt: () => import('./pt').then((m) => m.corgiPt),
  pl: () => import('./pl').then((m) => m.corgiPl),
  ru: () => import('./ru').then((m) => m.corgiRu),
  ja: () => import('./ja').then((m) => m.corgiJa),
  ko: () => import('./ko').then((m) => m.corgiKo),
  vi: () => import('./vi').then((m) => m.corgiVi),
  tr: () => import('./tr').then((m) => m.corgiTr),
  th: () => import('./th').then((m) => m.corgiTh),
  id: () => import('./id').then((m) => m.corgiId),
};
