import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { zh } from './zh';
import { detectLocale, formatAmount, setLocale, t } from './index';

function leaves(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`)));
}

describe('i18n', () => {
  afterEach(() => setLocale('en'));

  it('every table has the same keys and no empty strings', () => {
    expect(leaves(zh).sort()).toEqual(leaves(en).sort());
    for (const table of [en, zh]) {
      for (const key of leaves(table)) expect(t(key as never)).not.toBe('');
    }
  });

  it('keeps the same placeholders in every language', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    setLocale('en');
    const english = leaves(en).map((k) => holes(t(k as never)));
    setLocale('zh');
    expect(leaves(en).map((k) => holes(t(k as never)))).toEqual(english);
  });

  it('fills placeholders and switches language', () => {
    expect(t('lobby.best', { wave: 37 })).toBe('Best: wave 37');
    setLocale('zh');
    expect(t('lobby.best', { wave: 37 })).toBe('最佳：第 37 波');
    expect(t('chapter.1')).toBe('荒寺');
  });

  it('detects the language from a preference list', () => {
    expect(detectLocale(['de-DE', 'zh-CN'])).toBe('zh');
    expect(detectLocale(['zh_CN'])).toBe('zh');
    expect(detectLocale(['fr'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('formats amounts compactly per language', () => {
    expect(formatAmount(950, 'en')).toBe('950');
    expect(formatAmount(1234, 'en')).toBe('1.2k');
    expect(formatAmount(12345, 'en')).toBe('12k');
    expect(formatAmount(4_560_000, 'en')).toBe('4.5M');
    expect(formatAmount(9999, 'zh')).toBe('9999');
    expect(formatAmount(12345, 'zh')).toBe('1.2万');
    expect(formatAmount(340_000_000, 'zh')).toBe('3.4亿');
  });
});
