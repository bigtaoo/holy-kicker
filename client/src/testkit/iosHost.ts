/**
 * The iOS app's host for the headless shell: window.HKNative as the Capacitor shell injects it
 * (AdMob from adHosts.ts, plus StoreKit and the notifications), the hot-update plugin and the OTA
 * manifest, put together with the real adapters (StoreKit, NativeNotifier, AdMob under adFree,
 * findOta/installOta) the way IosPlatform does. Every answer the shell or the plugin would send
 * is the test's to give.
 */
import type { MemoryStore } from '../meta/saveStore';
import { adFree } from '../platform/ios/adFree';
import { AdMob } from '../platform/ios/admob';
import type { NotifyState, StoreResult, StoreState } from '../platform/ios/bridge';
import { nativeNotifier } from '../platform/ios/notify';
import { findOta, otaUpdates, type Bundle, type OtaManifest, type Updater } from '../platform/ios/ota';
import { StoreKit } from '../platform/ios/storeKit';
import { ADMOB_ON, fakeHkNative } from './adHosts';
import type { FakeHost } from './fakePlatform';

export interface IosShellOptions {
  /** The notification permission at launch; null before the system has answered. */
  notify?: NotifyState['status'] | null;
  /** StoreKit's state at launch; null before it has answered (an offline launch). */
  store?: StoreState | null;
  /** The bridge contract (HKNative.v). */
  v?: number;
}

/** StoreKit with the card for sale at `price` and nothing owned. */
export function forSale(id: string, price = 'US$3.99'): StoreState {
  return { products: [{ id, price }], owned: [], canPay: true };
}

/** The shell's bridge: what it was asked to do, and its answers, sent when the test says. */
export function fakeIosShell(o: IosShellOptions = {}) {
  const ads = fakeHkNative(ADMOB_ON);
  let notifyState: NotifyState | null = o.notify === null ? null : { status: o.notify ?? 'unknown' };
  let onNotify: ((s: NotifyState) => void) | null = null;
  let onStore: ((s: StoreState) => void) | null = null;
  let onResult: ((r: StoreResult) => void) | null = null;
  const calls: string[] = [];
  /** Booked reminders by id, as the system holds them. */
  const booked = new Map<string, { at: number; title: string; body: string }>();
  const store = o.store === undefined ? null : o.store;
  Object.assign(ads.native, {
    v: o.v ?? 6,
    notify: () => notifyState,
    onNotify: (cb: (s: NotifyState) => void) => (onNotify = cb),
    notifyAsk: () => void calls.push('notifyAsk'),
    notifySchedule: (id: string, at: number, title: string, body: string) => void booked.set(id, { at, title, body }),
    notifyCancel: (id: string) => void booked.delete(id),
    store: () => store,
    onStore: (cb: (s: StoreState) => void) => (onStore = cb),
    onStoreResult: (cb: (r: StoreResult) => void) => (onResult = cb),
    buy: (id: string) => void calls.push(`buy ${id}`),
    restore: () => void calls.push('restore'),
  });
  return {
    ...ads,
    calls,
    booked,
    /** The system's answer to the permission sheet (or a change made in the phone's settings). */
    answerNotify: (status: NotifyState['status']) => {
      notifyState = { status };
      onNotify?.({ status });
    },
    /** A new StoreKit state: a purchase, a refund, the price. */
    pushStore: (s: StoreState) => onStore?.(s),
    /** How a buy or a restore went. */
    storeResult: (r: StoreResult) => onResult?.(r),
  };
}

export type FakeIosShell = ReturnType<typeof fakeIosShell>;

/** The hot-update plugin and the manifest on the app's host: each download waits on the test. */
export function fakeOta(o: { running?: string; native?: string; manifest?: Partial<OtaManifest> | null } = {}) {
  const running = o.running ?? '1.0.22.1';
  const calls: string[] = [];
  let progress: ((e: { percent: number }) => void) | null = null;
  let finish: { resolve: (b: Bundle) => void; reject: (e: Error) => void } | null = null;
  const updater: Updater = {
    notifyAppReady: async () => calls.push('ready'),
    current: async () => ({ native: o.native ?? '1.0' }),
    list: async () => ({ bundles: [] }),
    download: (d) => {
      calls.push(`download ${d.version}`);
      return new Promise<Bundle>((resolve, reject) => (finish = { resolve, reject }));
    },
    set: async ({ id }) => void calls.push(`set ${id}`),
    addListener: async (_e, cb) => {
      progress = cb;
      return { remove: async () => void (progress = null) };
    },
    reset: async () => void calls.push('reset'),
  };
  const ota = {
    calls,
    updater,
    /** The manifest the next check reads; null when it cannot be fetched. */
    manifest: o.manifest === undefined ? newer(running) : o.manifest,
    /** Manifest reads so far. */
    checks: 0,
    /** What a manifest read waits on before it answers. */
    gate: Promise.resolve(),
    /** Holds the next manifest reads until the returned release is called (a slow network). */
    hold: (): (() => void) => {
      let release = () => {};
      ota.gate = new Promise<void>((r) => (release = r));
      return release;
    },
    /** The download's progress, 0..100. */
    percent: (p: number) => progress?.({ percent: p }),
    /** The download ends: done, or failed. */
    downloaded: () => finish?.resolve({ id: 'b7', version: ota.manifest?.version ?? '', status: 'pending' }),
    failed: () => finish?.reject(new Error('network lost')),
  };
  return ota;
}

/** A manifest one bundle above `running`. */
export function newer(running: string): OtaManifest {
  const parts = running.split('.');
  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  return { version: parts.join('.'), url: 'https://ota.test/b.zip', checksum: 'ab12' };
}

export type FakeOta = ReturnType<typeof fakeOta>;

/** The iOS app's host over `storage`: ads, store, reminders and hot updates through `shell` and `ota`. */
export function iosHost(shell: FakeIosShell, ota: FakeOta, storage: MemoryStore, running = '1.0.22.1'): FakeHost & { storeKit: StoreKit } {
  const storeKit = new StoreKit(shell.native, storage);
  const notify = nativeNotifier(shell.native) ?? undefined;
  const find = () => findOta(running, true, ota.updater, async () => {
    ota.checks++;
    await ota.gate;
    return ota.manifest;
  }, storage, shell.native.v ?? 0);
  return {
    storeKit,
    store: storeKit.available() ? storeKit : null,
    ads: adFree(new AdMob(shell.native), () => storeKit.owned()),
    notify,
    updates: otaUpdates(find, ota.updater),
  };
}
