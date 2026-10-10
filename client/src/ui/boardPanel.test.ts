import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { resultOf } from './boardPanel';

// A board row's result: a clear shows its bare time to a tenth, a loss the wave it fell on.

describe('board result', () => {
  it('shows a clear as minutes, seconds and the tenth that splits runs within a second', () => {
    expect(resultOf({ won: true, wave: 50, tenths: 7629 })).toBe('12:42.9');
    expect(resultOf({ won: true, wave: 50, tenths: 7631 })).toBe('12:43.1');
    expect(resultOf({ won: true, wave: 50, tenths: 600 })).toBe('1:00.0');
  });

  it('shows a loss as its wave', () => {
    setLocale('en');
    expect(resultOf({ won: false, wave: 34, tenths: 9000 })).toBe('Wave 34');
  });
});
