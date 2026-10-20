import type { Locale, Table } from '../index';
import type { monkEn } from '../monk/en';

// Holy Kicker's words past English and Chinese, each fetched with the shared table of its language
// (i18n/more.ts), which the WeChat build swaps the same way for an empty one.
export const MORE: Partial<Record<Locale, () => Promise<Table<typeof monkEn>>>> = {
  de: () => import('./de').then((m) => m.monkDe),
  fr: () => import('./fr').then((m) => m.monkFr),
  es: () => import('./es').then((m) => m.monkEs),
  it: () => import('./it').then((m) => m.monkIt),
  pt: () => import('./pt').then((m) => m.monkPt),
  pl: () => import('./pl').then((m) => m.monkPl),
  ru: () => import('./ru').then((m) => m.monkRu),
  ja: () => import('./ja').then((m) => m.monkJa),
  ko: () => import('./ko').then((m) => m.monkKo),
  vi: () => import('./vi').then((m) => m.monkVi),
  tr: () => import('./tr').then((m) => m.monkTr),
  th: () => import('./th').then((m) => m.monkTh),
  id: () => import('./id').then((m) => m.monkId),
};
