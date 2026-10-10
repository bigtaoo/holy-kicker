import { describe, expect, it } from 'vitest';
import { audienceOf } from './audience';
import type { ClientEvent } from './protocol';

const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1',
  iphoneApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  wechat: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50 MiniGame',
};

const of = (ua: string | undefined, country?: string, events: ClientEvent[] = []) => audienceOf({ 'user-agent': ua, 'cf-ipcountry': country }, events);

describe('audience', () => {
  it('names the browser, the system and the kind of device', () => {
    expect(of(UA.winChrome, 'IN')).toEqual({ device: 'desktop', browser: 'Chrome', os: 'Windows', country: 'IN' });
    expect(of(UA.winEdge)).toMatchObject({ browser: 'Edge', os: 'Windows' });
    expect(of(UA.macSafari)).toMatchObject({ device: 'desktop', browser: 'Safari', os: 'macOS' });
    expect(of(UA.iphoneSafari)).toMatchObject({ device: 'mobile', browser: 'Safari', os: 'iOS' });
    expect(of(UA.iphoneChrome)).toMatchObject({ browser: 'Chrome', os: 'iOS' });
    expect(of(UA.iphoneApp)).toMatchObject({ device: 'mobile', browser: 'WebView', os: 'iOS' });
    expect(of(UA.androidPhone)).toMatchObject({ device: 'mobile', browser: 'Chrome', os: 'Android' });
    expect(of(UA.androidTablet)).toMatchObject({ device: 'tablet', browser: 'Samsung', os: 'Android' });
    expect(of(UA.firefox)).toMatchObject({ device: 'desktop', browser: 'Firefox', os: 'Linux' });
    expect(of(UA.wechat)).toMatchObject({ device: 'mobile', browser: 'WeChat', os: 'iOS' });
    expect(of('curl/8.0')).toMatchObject({ browser: 'other', os: 'other' });
    expect(of(undefined)).toEqual({ device: 'unknown', browser: 'unknown', os: 'unknown', country: 'unknown' });
  });

  it('takes the device the game names over the user agent', () => {
    // iPadOS Safari passes for a Mac
    const session: ClientEvent = { e: 'session', t: 0, p: { runs: 0, level: 1, device: 'tablet' } };
    expect(of(UA.macSafari, 'JP', [session])).toEqual({ device: 'tablet', browser: 'Safari', os: 'macOS', country: 'JP' });
    expect(of(UA.macSafari, undefined, [{ ...session, p: { device: 'fridge' } }]).device).toBe('desktop');
  });

  it('keeps only real country codes', () => {
    expect(of(UA.winChrome, 'ar').country).toBe('AR');
    for (const cc of ['XX', 'T1', '', 'EGY']) expect(of(UA.winChrome, cc).country).toBe('unknown');
  });
});
