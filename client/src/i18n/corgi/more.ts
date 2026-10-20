import type { Locale, Table } from '../index';
import type { monkEn } from '../monk/en';

// Corgi Commando's words past English and Chinese, each fetched with the shared table of its language
// (i18n/more.ts), which the WeChat build swaps the same way for an empty one.
export const MORE: Partial<Record<Locale, () => Promise<Table<typeof monkEn>>>> = {
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
