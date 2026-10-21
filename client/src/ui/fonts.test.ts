import { afterEach, describe, expect, it } from 'vitest';
import { digitFont, FONT, fontFor, setDisplayFont } from './fonts';

describe('fonts', () => {
  afterEach(() => setDisplayFont(null));

  it('keeps the system fonts until the display font loads', () => {
    expect(fontFor('en', true)).toBe(FONT);
    expect(digitFont()).toBe('Arial');
  });

  it('puts the display font first for display text in the languages it covers', () => {
    setDisplayFont('Lilita One');
    expect(fontFor('en', true)).toBe(`"Lilita One", ${FONT}`);
    expect(fontFor('de', true).startsWith('"Lilita One"')).toBe(true);
    expect(fontFor('en', false)).toBe(FONT);
    expect(digitFont().startsWith('"Lilita One"')).toBe(true);
  });

  it('leaves the languages it lacks letters for on their own fonts', () => {
    setDisplayFont('Lilita One');
    for (const l of ['zh', 'ja', 'ko', 'th', 'ru', 'vi', 'pl', 'tr'] as const) expect(fontFor(l, true)).not.toContain('Lilita');
    expect(fontFor('ja', true)).toBe(fontFor('ja', false));
  });
});
