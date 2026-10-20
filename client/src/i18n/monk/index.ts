import { monkEn } from './en';
import { monkZh } from './zh';

// Holy Kicker's words (docs/reskin.md "Words"), laid over the shared tables by i18n/index.ts in a
// monk build only. Like the shared tables, en and zh come in the bundle and the other languages
// are fetched (monk/more.ts).
export const MONK = { en: monkEn, zh: monkZh };
