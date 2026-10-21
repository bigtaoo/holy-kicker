import type { Locale } from '../i18n';

// The canvas fonts. Body text uses the system fonts with CJK fallbacks (docs/design.md
// "Localization"); titles, buttons, big numbers and the damage digits use the display font,
// Lilita One (art/fonts/README.md), where it has every letter of the language.

/** System fonts with CJK fallbacks. */
export const FONT = 'Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
/** Japanese and Korean put their own fonts first, so shared Han characters take their forms;
 *  Arial has no Thai, so Thai names the system Thai fonts before the browser guesses one. */
const LOCAL_FONT: Partial<Record<Locale, string>> = {
  ja: 'Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, "Noto Sans CJK JP", sans-serif',
  ko: 'Arial, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif',
  th: 'Tahoma, "Leelawadee UI", Thonburi, "Noto Sans Thai", Arial, sans-serif',
};

/** The display font's file and the family it is registered under. */
export const DISPLAY_FILE = 'art/fonts/LilitaOne-Regular.ttf';
export const DISPLAY_FAMILY = 'Lilita One';
/** The languages whose every letter the display font has; the others keep the system fonts, since
 *  a word mixing two fonts looks worse than either (Polish, Turkish, Vietnamese, Russian miss some). */
const DISPLAY_LOCALES: ReadonlySet<Locale> = new Set(['en', 'de', 'fr', 'es', 'it', 'pt', 'id']);
/** Text this big or bigger is display text (buttons are, whatever their size). */
export const DISPLAY_SIZE = 52;

let display: string | null = null;

/** The family the display font loaded as, or null to draw everything in the system fonts. */
export function setDisplayFont(family: string | null): void {
  display = family;
}

const quoted = (family: string) => `"${family.replace(/"/g, '')}"`;

/** The font stack for text in `locale`, display text or body. */
export function fontFor(locale: Locale, displayText: boolean): string {
  const body = LOCAL_FONT[locale] ?? FONT;
  return display && displayText && DISPLAY_LOCALES.has(locale) ? `${quoted(display)}, ${body}` : body;
}

/** The font of the damage digits, which the display font has in every language. */
export function digitFont(): string {
  return display ? `${quoted(display)}, Arial, sans-serif` : 'Arial';
}
