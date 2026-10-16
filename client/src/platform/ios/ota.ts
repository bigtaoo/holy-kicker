import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

// Hot updates of the web layer (docs/ios.md "Hot updates"), after D:\funny's platform/ota.ts: the
// Capgo plugin in the shell, driven by hand from here against our own static manifest, never
// Capgo's cloud (capacitor.config.ts turns its update loop and its stats off).
//
// Once the game is up, `checkOta` tells the plugin this bundle booted (else, after
// appReadyTimeout, it rolls back to the one before), reads the manifest and downloads a newer
// bundle this shell can run. It does not arm it with next(): the plugin swaps an armed bundle in
// whenever the app goes to the background, which would throw away a run the player only switched
// away from. Instead `applyDownloaded`, first thing at the next launch, switches to it before
// anything is drawn.

export const MANIFEST_URL = 'https://hk-ota.gamestao.com/manifest.json';
const FETCH_TIMEOUT_MS = 8000;

export interface OtaManifest {
  /** `<shell version>.<n>`, the bundle's own __HK_BUNDLE__. */
  version: string;
  /** The zipped dist-ios. */
  url: string;
  /** sha256 of the zip, hex; the plugin refuses a download without one. */
  checksum: string;
  /** The oldest shell (CFBundleShortVersionString) the bundle runs on. */
  minNativeVersion?: string;
}

/** A bundle the plugin keeps on the device. */
export interface Bundle {
  id: string;
  version: string;
  status: string;
}

/** True when dotted version `a` is strictly above `b`; missing or non-numeric parts count as 0. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * Whether the bundle running at `running` on shell `native` should download the manifest's: newer,
 * runnable here, and not on the device already (waiting, or failed once: a bundle that never
 * booted is not fetched again until a newer one is published).
 */
export function wantsDownload(m: Partial<OtaManifest> | null, running: string, native: string, have: Bundle[]): m is OtaManifest {
  if (!m || typeof m.version !== 'string' || typeof m.url !== 'string' || typeof m.checksum !== 'string') return false;
  if (!m.checksum || !isNewer(m.version, running)) return false;
  if (m.minNativeVersion && isNewer(m.minNativeVersion, native)) return false;
  return !have.some((b) => b.version === m.version);
}

/** The newest downloaded bundle above the running one, if any. */
export function pickDownloaded(have: Bundle[], running: string): Bundle | null {
  let best: Bundle | null = null;
  for (const b of have) {
    if ((b.status === 'pending' || b.status === 'success') && isNewer(b.version, best?.version ?? running)) best = b;
  }
  return best;
}

/** The plugin's calls this module makes, so a test can stand in for it. */
export interface Updater {
  notifyAppReady(): Promise<unknown>;
  current(): Promise<{ native: string }>;
  list(): Promise<{ bundles: Bundle[] }>;
  download(o: { url: string; version: string; checksum: string }): Promise<Bundle>;
  set(o: { id: string }): Promise<void>;
}

const plugin = CapacitorUpdater as unknown as Updater;

/** Bundles built by the iOS workflows, inside the shell; never in Safari or development. */
const active = (running: string, inShell: boolean) => running !== '0.0.0' && inShell;

/**
 * First thing at launch: switch to a bundle the last session downloaded. True when it did, and the
 * page is about to reload into it, so the caller boots nothing.
 */
export async function applyDownloaded(running = __HK_BUNDLE__, inShell = Capacitor.isNativePlatform(), updater = plugin): Promise<boolean> {
  if (!active(running, inShell)) return false;
  try {
    const next = pickDownloaded((await updater.list()).bundles, running);
    if (!next) return false;
    await updater.set({ id: next.id });
    return true;
  } catch (e) {
    console.warn('[ota] kept the running bundle:', e);
    return false;
  }
}

async function fetchManifest(running: string): Promise<Partial<OtaManifest> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${MANIFEST_URL}?v=${encodeURIComponent(running)}`, { cache: 'no-store', signal: ctrl.signal });
    return res.ok ? ((await res.json()) as Partial<OtaManifest>) : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Once the game is up: confirm this bundle, then fetch a newer one for the next launch. Never
 * throws: offline, a bad manifest or a failed download leave the player on the bundle they have.
 */
export async function checkOta(
  running = __HK_BUNDLE__,
  inShell = Capacitor.isNativePlatform(),
  updater = plugin,
  manifest: (running: string) => Promise<Partial<OtaManifest> | null> = fetchManifest,
): Promise<'none' | 'downloaded'> {
  if (!active(running, inShell)) return 'none';
  try {
    await updater.notifyAppReady();
    const m = await manifest(running);
    const { native } = await updater.current();
    if (!wantsDownload(m, running, native, (await updater.list()).bundles)) return 'none';
    await updater.download({ url: m.url, version: m.version, checksum: m.checksum });
    return 'downloaded';
  } catch (e) {
    console.warn('[ota] no update:', e);
    return 'none';
  }
}
