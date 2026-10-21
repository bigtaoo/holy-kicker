import { actOf, mapOf } from '@hk/engine';
import { t } from '.';

// A chapter's name: its map's (chapter.1–5 in the theme tables), with the act after the first
// round of the maps as a Roman numeral (chapter 7: "Misty Marsh II"), so twenty chapters need no
// names of their own.

const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI'];

export function chapterName(chapter: number): string {
  return t(`chapter.${mapOf(chapter)}` as never) + (ROMAN[actOf(chapter)] ?? ` ${actOf(chapter)}`);
}
