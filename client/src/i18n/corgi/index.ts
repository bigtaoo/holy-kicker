import { corgiEn } from './en';
import { corgiZh } from './zh';

// Corgi Commando's words (docs/reskin.md "Words"), laid over the shared tables by i18n/index.ts in
// a corgi build only. Like the shared tables, en and zh come in the bundle and the other languages
// are fetched (corgi/more.ts).
export const CORGI = { en: corgiEn, zh: corgiZh };
