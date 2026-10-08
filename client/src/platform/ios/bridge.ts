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
  /** Game Center's last state, null until GameKit has answered (v2). */
  gameCenter(): GameCenterState | null;
  /** Called with every new Game Center state (v2). */
  onGameCenter(cb: (state: GameCenterState) => void): void;
  /** Shows Apple's sign-in sheet; only from a tap (v2). */
  gameCenterSignIn(): void;
  /** AdMob's last state, null before the shell has sent one (v3). */
  adState(): AdState | null;
  /** Called with every new AdMob state (v3). */
  onAdState(cb: (state: AdState) => void): void;
  /** Called as an ad asked for with showAd goes on screen and goes away (v3). */
  onAdEvent(cb: (event: AdEvent) => void): void;
  /** Shows the loaded ad of that kind; its progress comes back through onAdEvent (v3). */
  showAd(kind: AdKind): void;
  /** Shows Google's privacy options form, from a tap (v3). */
  adPrivacy(): void;
}

export type AdKind = 'rewarded' | 'interstitial';

/** AdMob as the shell sees it (AdMob.swift). */
export interface AdState {
  /** 'pending' until the consent answer is in, then whether ads may be requested at all. */
  status: 'pending' | 'on' | 'off';
  /** Whether an ad of that kind is loaded and can be shown now. */
  rewarded: boolean;
  interstitial: boolean;
  /** Whether Google's consent form applies here (EEA/UK), so settings offers it again. */
  privacyOptions: boolean;
  /** Why the last load failed ('GADErrorDomain 3: …', 3 is no fill), null once one worked. */
  error: string | null;
}

/** An ad's progress: 'started' when it is on screen, then 'done' (ok: the reward was earned);
 *  'done' alone when it could not be shown. */
export interface AdEvent {
  kind: AdKind;
  event: 'started' | 'done';
  ok: boolean;
}

/** Game Center as the shell sees it (GameCenter.swift). */
export interface GameCenterState {
  /** The signed-in player's nickname, null when not signed in. */
  alias: string | null;
  /** Whether Apple's sign-in sheet is waiting to be shown. */
  canSignIn: boolean;
}

/** The shell's bridge, or null in a browser. Members may be missing on an older shell. */
export function hkNative(scope: object = globalThis): Partial<HKNative> | null {
  const n = (scope as { HKNative?: unknown }).HKNative;
  return n && typeof n === 'object' ? (n as Partial<HKNative>) : null;
}
