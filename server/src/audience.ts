import { DEVICES, type ClientEvent, type Device } from './protocol';

// Who a new install is, in coarse classes only: the kind of device, the browser and system
// families, the country and whether it came through a browser or an app. Read once, from the
// install's first batch: the browser's user agent, Cloudflare's country header (from the address,
// which is never kept) and the `device` and `app` the client names in its `session` event (it
// knows the tablets a user agent hides, and CrazyGames' SDK says when its own app runs the game). Pure.

export interface Audience {
  device: Device | 'unknown';
  browser: string;
  os: string;
  /** ISO 3166-1 alpha-2, or 'unknown' (no header, Tor, an address Cloudflare cannot place). */
  country: string;
  /** `browser`, CrazyGames' `android-app` or `ios-app`, `pwa`, `webview` (some app's web view,
   *  guessed from the user agent when the host does not say), `other` or `unknown`; missing on
   *  installs kept before 2026-10-21. */
  app?: string;
}

/** The dimensions the stats split new installs by, in the order the dashboard shows them. */
export const AUDIENCE_KEYS = ['device', 'app', 'browser', 'os', 'country'] as const;

/** First match wins: the browsers built on Chrome name themselves before it. */
const BROWSERS: [RegExp, string][] = [
  [/MicroMessenger/, 'WeChat'],
  // Android's web view names Chrome too; `; wv)` gives it away
  [/Android.*; wv\)/, 'WebView'],
  [/SamsungBrowser/, 'Samsung'],
  [/YaBrowser/, 'Yandex'],
  [/OPR\/|Opera|OPX\//, 'Opera'],
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/Firefox\/|FxiOS/, 'Firefox'],
  [/CriOS|Chrome\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
  // iOS apps and in-app browsers: Apple's web view without Safari's name
  [/iPhone|iPad|iPod/, 'WebView'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

const pick = (ua: string, table: [RegExp, string][]) => table.find(([re]) => re.test(ua))?.[1] ?? (ua ? 'other' : 'unknown');

function deviceOf(ua: string): Audience['device'] {
  if (!ua) return 'unknown';
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android/.test(ua)) return 'mobile';
  return 'desktop';
}

/** CrazyGames' applicationType (the `app` of a `session`) to the audience's names. */
const APPS: Record<string, string> = { web: 'browser', google_play_store: 'android-app', apple_store: 'ios-app', pwa: 'pwa' };

function appOf(hint: unknown, ua: string, browser: string): string {
  if (typeof hint === 'string' && hint) return APPS[hint] ?? 'other';
  if (!ua) return 'unknown';
  return browser === 'WebView' || browser === 'WeChat' ? 'webview' : 'browser';
}

/** The audience of a batch from its request headers (lower-case names) and its events. */
export function audienceOf(headers: Record<string, string | undefined>, events: readonly ClientEvent[]): Audience {
  const ua = headers['user-agent'] ?? '';
  const session = events.find((e) => e.e === 'session')?.p;
  const hint = session?.device;
  const cc = (headers['cf-ipcountry'] ?? '').toUpperCase();
  const browser = pick(ua, BROWSERS);
  return {
    device: (DEVICES as readonly unknown[]).includes(hint) ? (hint as Device) : deviceOf(ua),
    browser,
    os: pick(ua, SYSTEMS),
    country: /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1' ? cc : 'unknown',
    app: appOf(session?.app, ua, browser),
  };
}
