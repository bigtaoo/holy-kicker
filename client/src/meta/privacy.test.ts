import { describe, expect, it } from 'vitest';
import { policyUrl, privacyRegion, sharingOf } from './privacy';

describe('privacy', () => {
  it('asks in the EEA, the UK and Switzerland, by the host country first', () => {
    for (const c of ['DE', 'fr', 'GB', 'CH', 'NO', 'EL']) expect(privacyRegion(c, null)).toBe('consent');
    for (const c of ['US', 'BR', 'CN', 'TR']) expect(privacyRegion(c, 'Europe/Berlin')).toBe('notice');
  });

  it('falls back to the time zone, and asks when it knows neither', () => {
    expect(privacyRegion(null, 'Europe/Paris')).toBe('consent');
    expect(privacyRegion(null, 'Atlantic/Canary')).toBe('consent');
    expect(privacyRegion(null, 'America/New_York')).toBe('notice');
    expect(privacyRegion(null, 'Asia/Shanghai')).toBe('notice');
    expect(privacyRegion(null, null)).toBe('consent');
  });

  it('holds data until a player who is asked answers; elsewhere it goes out unless turned off', () => {
    expect(sharingOf('consent', 'ask')).toBe('hold');
    expect(sharingOf('consent', 'yes')).toBe('send');
    expect(sharingOf('consent', 'no')).toBe('off');
    expect(sharingOf('notice', 'ask')).toBe('send');
    expect(sharingOf('notice', 'no')).toBe('off');
  });

  it('links the policy in Chinese for Chinese players only', () => {
    expect(policyUrl('https://hk.test', 'zh')).toBe('https://hk.test/privacy?lang=zh');
    expect(policyUrl('https://hk.test', 'de')).toBe('https://hk.test/privacy');
  });
});
