import type { en } from './en';
import type { Locale, Table } from './index';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { pl } from './pl';
import { pt } from './pt';
import { ru } from './ru';

// The languages past English and Chinese. Kept apart so the WeChat build, whose players read
// Chinese and whose main package is capped at 4 MB, swaps this file for an empty one
// (vite.wechat.config.js) and ships en and zh alone.
export const MORE: Partial<Record<Locale, Table<typeof en>>> = { de, fr, es, it, pt, pl, ru, ja, ko };
