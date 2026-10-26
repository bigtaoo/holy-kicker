import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, t } from '../i18n';
import { installHeadless } from '../testkit/headless';
import { BossBar } from './bossBar';

installHeadless();

describe('BossBar', () => {
  afterEach(() => setLocale('en'));

  it('reads its name again after a language switch in the pause menu', () => {
    const bar = new BossBar('boss.twins');
    const name = () => (bar.view.children[1] as unknown as { text: string }).text;
    expect(name()).toBe(t('boss.twins'));
    setLocale('zh');
    bar.set(5, 10);
    expect(name()).toBe(t('boss.twins'));
    expect(name()).not.toBe(t('boss.demon'));
  });

  it('renames to another key', () => {
    const bar = new BossBar('boss.carp');
    bar.rename('boss.carpEmpowered');
    expect((bar.view.children[1] as unknown as { text: string }).text).toBe(t('boss.carpEmpowered'));
  });
});
