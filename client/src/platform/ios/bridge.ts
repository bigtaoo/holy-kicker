// window.HKNative: what the iOS shell injects into the page at document start
// (client/ios/App/App/HKBridgeViewController.swift, contract in docs/ios.md). Everything is read
// through hkNative() and feature-detected, so a web bundle newer than the shell it runs in
// degrades to the browser's behaviour instead of throwing.

export interface HKNative {
  /** The contract's version, raised when the shell gains calls. */
  v: number;
  /** The key store's copy in UserDefaults, as it was at launch. */
  saved: Record<string, string>;
  /** Mirrors one key into UserDefaults (fire and forget). */
  save(key: string, value: string): void;
  /** Opens a page in Safari; window.open from a tap is dropped silently in WKWebView. */
  openUrl(url: string): void;
  /** Locale.preferredLanguages: the phone's languages, most preferred first. */
  languages: string[];
  /** The phone's model identifier and system, e.g. 'iPhone15,2 iOS 18.1'. */
  device: string;
}

/** The shell's bridge, or null in a browser. Members may be missing on an older shell. */
export function hkNative(scope: object = globalThis): Partial<HKNative> | null {
  const n = (scope as { HKNative?: unknown }).HKNative;
  return n && typeof n === 'object' ? (n as Partial<HKNative>) : null;
}
