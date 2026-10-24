/**
 * Fakes of each ad host's SDK surface, as far as the platform adapters call it, for the ad-flow
 * tests next to each adapter. Every fake records what the adapter asked for and lets a test play
 * the host's side: an ad loaded, on screen, finished, closed early, failed or unfilled, in any
 * order and at any time, including after the adapter has given the ad up.
 */
import type { CgAdCallbacks, CgAdType, CgSdkShape } from '../platform/crazygames/sdk';
import type { AdEvent, AdKind, AdState, HKNative } from '../platform/ios/bridge';
import type { BridgeShape } from '../platform/playgama/bridge';
import type { AdApi } from '../platform/wechat/weChatAds';

/** The game's side of one ad, as the shell sees it: on screen (muted, game held) from `started`
 *  until the promise settles. A start after that would hold the sound for good. */
export interface AdWatch<T> {
  result: Promise<T>;
  /** Times `started` ran. */
  starts(): number;
  /** Times `started` ran after the ad had settled. */
  lateStarts(): number;
  /** Started and not settled yet: the shell mutes and holds the game now. */
  onScreen(): boolean;
  settled(): boolean;
}

export function watchAd<T>(play: (started: () => void) => Promise<T>): AdWatch<T> {
  let starts = 0;
  let late = 0;
  let settled = false;
  const result = play(() => {
    starts++;
    if (settled) late++;
  }).finally(() => (settled = true));
  return { result, starts: () => starts, lateStarts: () => late, onScreen: () => starts > 0 && !settled, settled: () => settled };
}

// --- CrazyGames SDK v3 ---

export function fakeCrazyGames(o: { basicLaunch?: boolean; adblock?: boolean; environment?: string } = {}) {
  const calls: string[] = [];
  const requests: { type: CgAdType; cb: CgAdCallbacks }[] = [];
  const data = new Map<string, string>();
  const sdk: CgSdkShape = {
    environment: o.environment ?? 'crazygames',
    init: async () => {},
    game: {
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      happytime: () => calls.push('happytime'),
    },
    ad: {
      requestAd: (type, cb) => void requests.push({ type, cb }),
      hasAdblock: async () => o.adblock === true,
      prefetchAd: () => {
        if (o.basicLaunch) throw Object.assign(new Error('ads disabled'), { code: 'adsDisabledBasicLaunch' });
      },
    },
    banner: {
      requestBanner: (b) => calls.push(`banner ${b.id} ${b.width}x${b.height}`),
      clearBanner: (id) => calls.push(`clear ${id}`),
    },
    user: { getUser: async () => null, addAuthListener: () => {} },
    data: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
  };
  /** The last ad asked for. */
  const last = () => {
    const r = requests.at(-1);
    if (!r) throw new Error('no ad was requested');
    return r;
  };
  return {
    sdk,
    calls,
    requests,
    started: () => last().cb.adStarted?.(),
    finished: () => last().cb.adFinished?.(),
    /** CrazyGames ends an unfilled, failed or early-closed ad alike, with adError. */
    error: (why: unknown = 'unfilled') => last().cb.adError?.(why),
  };
}

// --- Playgama Bridge v2 ---

type Listener = (...args: unknown[]) => void;

export function fakeBridge(o: { id?: string; rewarded?: boolean; interstitial?: boolean; adblock?: boolean } = {}) {
  const subs = new Map<string, Listener[]>();
  const shows: string[] = [];
  const messages: string[] = [];
  const on = (event: string, cb: Listener) => void subs.set(event, [...(subs.get(event) ?? []), cb]);
  const fire = (event: string, ...args: unknown[]) => subs.get(event)?.forEach((cb) => cb(...args));
  const sdk: BridgeShape = {
    initialize: async () => {},
    version: '2.9.0',
    platform: { id: o.id ?? 'playgama', language: 'en', on, sendMessage: (m) => void messages.push(m) },
    storage: { get: async (keys) => keys.map(() => null), set: async () => {} },
    advertisement: {
      on,
      isRewardedSupported: o.rewarded ?? true,
      isInterstitialSupported: o.interstitial ?? true,
      showRewarded: () => void shows.push('rewarded'),
      showInterstitial: () => void shows.push('interstitial'),
      checkAdBlock: async () => o.adblock === true,
    },
    device: { type: 'mobile' },
    analytics: { send: () => {} },
  };
  return {
    sdk,
    shows,
    messages,
    /** One state of the rewarded ad: loading, opened, rewarded, closed, failed. */
    rewarded: (...states: string[]) => states.forEach((s) => fire('rewarded_state_changed', s)),
    interstitial: (...states: string[]) => states.forEach((s) => fire('interstitial_state_changed', s)),
    pause: (paused: boolean) => fire('pause_state_changed', paused),
  };
}

// --- WeChat (wx.createRewardedVideoAd, wx.createInterstitialAd) ---

/**
 * A WeChat ad as the base library hands it out: `load` and `show` answer as the test sets
 * (`fill`, `hang`), `show` rejects while none is loaded, and the test closes it, with whether a
 * video was watched to the end.
 */
export class FakeWxAd<Close> implements WxAd<Close> {
  loaded = false;
  /** load() fills (or rejects as no fill, WeChat's error 1004). */
  fill = true;
  /** show() does not answer until `answerShows` (the ad comes on screen late, or never). */
  hang = false;
  shows = 0;
  loads = 0;
  private onLoads: (() => void)[] = [];
  private onErrors: ((e: { errMsg?: string; errCode?: number }) => void)[] = [];
  private onCloses: ((res?: Close) => void)[] = [];
  private hung: (() => void)[] = [];

  load(): Promise<void> {
    this.loads++;
    if (!this.fill) {
      for (const cb of this.onErrors) cb({ errMsg: 'no advertisement', errCode: 1004 });
      return Promise.reject(new Error('no fill'));
    }
    this.loaded = true;
    for (const cb of this.onLoads) cb();
    return Promise.resolve();
  }
  show(): Promise<void> {
    if (!this.loaded && !this.hang) return Promise.reject(new Error('not loaded'));
    this.shows++;
    if (this.hang) return new Promise((r) => this.hung.push(r));
    return Promise.resolve();
  }
  /** The hung shows come on screen now. */
  answerShows(): void {
    for (const r of this.hung.splice(0)) r();
  }
  onLoad(cb: () => void): void {
    this.onLoads.push(cb);
  }
  onError(cb: (e: { errMsg?: string; errCode?: number }) => void): void {
    this.onErrors.push(cb);
  }
  onClose(cb: (res?: Close) => void): void {
    this.onCloses.push(cb);
  }
  /** The player closed it (a video: `{ isEnded }`, nothing from a base library before 2.1.0). */
  close(res?: Close): void {
    this.loaded = false;
    for (const cb of this.onCloses) cb(res);
  }
}

export function fakeWx() {
  const video = new FakeWxAd<{ isEnded?: boolean }>();
  const interstitial = new FakeWxAd<void>();
  const made: string[] = [];
  const api: AdApi = {
    createRewardedVideoAd: ({ adUnitId }) => (made.push(adUnitId), video),
    createInterstitialAd: ({ adUnitId }) => (made.push(adUnitId), interstitial),
  };
  return { api, video, interstitial, made };
}

// --- iOS: AdMob through the shell's bridge (window.HKNative) ---

export const ADMOB_ON: AdState = { status: 'on', rewarded: true, interstitial: true, privacyOptions: false, error: null };

export function fakeHkNative(initial: AdState | null = ADMOB_ON) {
  let state: ((s: AdState) => void) | null = null;
  let event: ((e: AdEvent) => void) | null = null;
  const shown: AdKind[] = [];
  const native: Partial<HKNative> = {
    v: 6,
    saved: {},
    save: () => {},
    languages: ['en'],
    device: 'iPhone15,2 iOS 18.1',
    adState: () => initial,
    onAdState: (cb) => (state = cb),
    onAdEvent: (cb) => (event = cb),
    showAd: (kind) => void shown.push(kind),
    adPrivacy: () => {},
  };
  return {
    native,
    shown,
    push: (s: AdState) => state?.(s),
    started: (kind: AdKind) => event?.({ kind, event: 'started', ok: false }),
    done: (kind: AdKind, ok: boolean) => event?.({ kind, event: 'done', ok }),
  };
}

// --- the browser, for the web-based hosts ---

/** The browser globals WebPlatform's constructor reads, with `search` as the page's query. */
export function browserGlobals(search = '') {
  const listeners: string[] = [];
  const el = () => ({ id: '', style: { cssText: '', display: '' }, textContent: '' });
  const nodes = new Map<string, ReturnType<typeof el>>();
  const document = {
    hidden: false,
    getElementById: (id: string) => nodes.get(id) ?? null,
    createElement: () => el(),
    body: { appendChild: (n: ReturnType<typeof el>) => void nodes.set(n.id, n) },
    addEventListener: (type: string) => void listeners.push(`document ${type}`),
    hasFocus: () => true,
  };
  const window = { addEventListener: (type: string) => void listeners.push(`window ${type}`) };
  return { location: { search }, document, window, listeners, banner: (id: string) => nodes.get(id) };
}
