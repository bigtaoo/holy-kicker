/**
 * A Platform for headless tests: the save in memory, files from `client/public` (or the corgi's
 * art), no ads, portal or banner unless asked for, and every host call a test may care about
 * recorded in `calls`.
 */
import { MemoryStore } from '../meta/saveStore';
import { fakeApp, readPublicText } from './headless';
import { NO_AD_PRIVACY, NO_ADS, NO_BANNER, NO_PORTAL, type Ads, type AppUpdates, type Banner, type Notifier, type Platform, type Portal, type Store } from '../platform/types';

export interface FakeHost {
  ads?: Ads;
  portal?: Portal;
  banner?: Banner;
  store?: Store | null;
  languages?: string[];
  country?: string | null;
  /** The iOS app's reminders and hot updates (testkit/iosHost.ts). */
  notify?: Notifier;
  updates?: AppUpdates;
  /** The phone can buzz: each buzz is recorded in `calls` as `vibrate` or `vibrate strong`. */
  vibrate?: boolean;
  /** Whether the keys reach the game now (a portal's iframe before a click: false); always, when left out. */
  keysReach?: () => boolean;
}

export type FakePlatform = Platform & { calls: string[]; hide(): void; press(code: string, repeat?: boolean): void };

export function fakePlatform(host: FakeHost = {}, storage = new MemoryStore()): FakePlatform {
  const calls: string[] = [];
  const hides: (() => void)[] = [];
  const keys: ((code: string, repeat: boolean) => void)[] = [];
  return {
    calls,
    hide: () => hides.forEach((cb) => cb()),
    press: (code, repeat = false) => keys.forEach((cb) => cb(code, repeat)),
    onKey: (cb) => void keys.push(cb),
    host: 'web',
    probe: async () => ({ mobile: true, tablet: false, memory: 4, cores: 4, gpu: 'headless' }) as never,
    createApp: async () => fakeApp(),
    bindStick() {},
    readKeys: () => ({ x: 0, y: 0 }),
    ...(host.keysReach && { keysReach: host.keysReach }),
    readText: async (path) => readPublicText(path),
    readBinary: async (path) => {
      const b = Buffer.from(readPublicText(path), 'binary');
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
    loadPack: async () => {},
    loadFont: async () => null,
    storage,
    languages: () => host.languages ?? ['en'],
    safeInsets: () => ({ top: 0, bottom: 0 }),
    onHide: (cb) => void hides.push(cb),
    onBattery() {},
    portal: host.portal ?? NO_PORTAL,
    ads: host.ads ?? NO_ADS,
    banner: host.banner ?? NO_BANNER,
    adPrivacy: NO_AD_PRIVACY,
    store: host.store ?? null,
    audio: null,
    askText: async () => null,
    device: () => 'headless',
    country: () => host.country ?? null,
    openUrl: (url) => void calls.push(`open ${url}`),
    ...(host.notify && { notify: host.notify }),
    ...(host.updates && { updates: host.updates }),
    ...(host.vibrate && { vibrate: (strong: boolean) => void calls.push(strong ? 'vibrate strong' : 'vibrate') }),
  };
}
