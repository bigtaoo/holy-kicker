import { THEME } from '../../theme';
import { adWatchdog, StrayAd, within, type AdTimer } from '../adTimeout';

// The GameDistribution HTML5 SDK (https://github.com/GameDistribution/GD-HTML5/wiki), wrapped like
// the CrazyGames SDK (../crazygames/sdk.ts) so nothing in the game can be broken by it:
//  - the script is missing in local dev, under an adblocker and in tests, so every call is a no-op
//    without it, every throw or rejection is caught, and boot waits for it at most SDK_WAIT_MS;
//  - its options (`GD_OPTIONS`, the game id and one event callback) go on the window before the
//    script, which is added once, at launch (the wiki: never from a button);
//  - SDK_GAME_PAUSE / SDK_GAME_START bracket every ad, whoever asked for it: the game mutes between them;
//  - showAd's promise settling says the ad is over, not that it paid: a rewarded ad pays only after
//    SDK_REWARDED_WATCH_COMPLETE; preloadAd('rewarded') rejecting means none is there to offer.

/** The game ids GameDistribution gave each theme (the console's draft); '' until it has one. */
export const GD_GAME_IDS: Record<string, string> = { monk: '', corgi: '' };

export const SDK_SRC = 'https://html5.api.gamedistribution.com/main.min.js';
const SCRIPT_ID = 'gamedistribution-jssdk';

export type GdAdType = 'interstitial' | 'rewarded';

export interface GdEvent {
  name?: unknown;
}

/** The SDK as used here; every member optional because it is a remote script. */
export interface GdSdkShape {
  showAd?: (type?: GdAdType) => unknown;
  preloadAd?: (type?: GdAdType) => unknown;
}

export interface GdGlobal {
  GD_OPTIONS?: { gameId: string; onEvent: (event: GdEvent) => void };
  gdsdk?: GdSdkShape;
  document?: { getElementById(id: string): unknown; createElement(tag: string): GdScript; head?: { appendChild(el: unknown): unknown } | null };
}

export interface GdScript {
  id: string;
  src: string;
  async: boolean;
  onerror: (() => void) | null;
}

/** How long boot waits for SDK_READY; a blocked script never sends it. */
export const SDK_WAIT_MS = 4000;
/** How long an offer waits for preloadAd's answer before it is hidden. */
export const PRELOAD_WAIT_MS = 3000;
/** How long a finished rewarded ad waits for a late SDK_REWARDED_WATCH_COMPLETE. */
export const COMPLETE_WAIT_MS = 1000;

/** Calls a game hook from an SDK callback without letting its throw reach the SDK. */
function guard(fn: (() => void) | undefined): void {
  try {
    fn?.();
  } catch {
    /* the hook's problem, never the ad's */
  }
}

/** How the launch went, for the console line: ready, error (the SDK said so) or timeout (no answer). */
export type GdStart = 'ready' | 'error' | 'timeout' | 'noid';

export class GdSdk {
  private ready = false;
  private readonly waiting: ((how: GdStart) => void)[] = [];
  private readonly pauseListeners: ((paused: boolean) => void)[] = [];
  private paused = false;
  /** The ad in flight's own hooks: its start, and whether it paid. */
  private current: { started(): void; complete(): void } | null = null;
  private readonly stray: StrayAd;

  constructor(
    private readonly global: GdGlobal = globalThis as unknown as GdGlobal,
    private readonly gameId: string = GD_GAME_IDS[THEME] ?? '',
    private readonly timer?: AdTimer,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.stray = new StrayAd(timer);
  }

  /** Puts the options on the window and adds the script; resolves once the SDK is ready, or how it
   *  failed, never a rejection and never later than SDK_WAIT_MS. */
  async load(): Promise<GdStart> {
    if (!this.gameId) return 'noid';
    this.global.GD_OPTIONS = { gameId: this.gameId, onEvent: (e) => this.event(e) };
    const answer = new Promise<GdStart>((resolve) => this.waiting.push(resolve));
    try {
      const doc = this.global.document;
      if (doc && !doc.getElementById(SCRIPT_ID)) {
        const s = doc.createElement('script');
        s.id = SCRIPT_ID;
        s.async = true;
        s.src = SDK_SRC;
        s.onerror = () => this.answer('error');
        doc.head?.appendChild(s);
      }
    } catch {
      return 'error';
    }
    return Promise.race([answer, this.sleep(SDK_WAIT_MS).then(() => 'timeout' as const)]);
  }

  private answer(how: GdStart): void {
    for (const resolve of this.waiting.splice(0)) resolve(how);
  }

  /** Every SDK event comes through here (GD_OPTIONS.onEvent). */
  event(e: GdEvent | null | undefined): void {
    switch (e?.name) {
      case 'SDK_READY':
        this.ready = true;
        this.answer('ready');
        break;
      case 'SDK_ERROR':
        this.answer('error');
        break;
      case 'SDK_GAME_PAUSE':
        this.current?.started();
        this.setPaused(true);
        break;
      case 'SDK_GAME_START':
        this.setPaused(false);
        break;
      case 'SDK_REWARDED_WATCH_COMPLETE':
        this.current?.complete();
        break;
    }
  }

  private setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    for (const cb of this.pauseListeners) guard(() => cb(paused));
  }

  /** Whether the SDK said it is ready. */
  isReady(): boolean {
    return this.ready && typeof this.global.gdsdk?.showAd === 'function';
  }

  /** The SDK pausing the game for an ad (true) and giving it back (false). */
  onPause(cb: (paused: boolean) => void): void {
    this.pauseListeners.push(cb);
  }

  /** Whether a rewarded ad is there to offer: preloadAd resolving, in time. */
  async rewardedReady(): Promise<boolean> {
    const sdk = this.global.gdsdk;
    if (!this.isReady() || typeof sdk?.preloadAd !== 'function') return false;
    try {
      await within(Promise.resolve(sdk.preloadAd('rewarded')), PRELOAD_WAIT_MS, this.timer);
      return true;
    } catch {
      return false;
    }
  }

  /** One ad; true only for a rewarded ad watched to its end. `started` runs when it is on screen. */
  async showAd(type: GdAdType, started?: () => void): Promise<boolean> {
    const sdk = this.global.gdsdk;
    // one at a time, and none over one given up that may still be playing
    if (!this.isReady() || typeof sdk?.showAd !== 'function' || this.current || this.stray.active()) return false;
    let paid = false;
    let paidNow: (() => void) | null = null;
    let giveUp = () => {};
    const gaveUp = new Promise<'gaveup'>((resolve) => (giveUp = () => resolve('gaveup')));
    // an ad that never comes on screen, or never ends, is given up (adTimeout.ts)
    const watch = adWatchdog(() => giveUp(), this.timer);
    this.current = {
      started: () => {
        watch.started();
        guard(started);
      },
      complete: () => {
        paid = true;
        paidNow?.();
      },
    };
    // its promise settling says the ad is over; a rejection (or a throw) that it failed, which never pays
    const shown = new Promise<unknown>((resolve) => resolve(sdk.showAd?.(type))).then(() => 'over' as const, () => 'failed' as const);
    const end = await Promise.race([shown, gaveUp]);
    if (end === 'over' && type === 'rewarded' && !paid) {
      await Promise.race([new Promise<void>((r) => (paidNow = r)), this.sleep(COMPLETE_WAIT_MS)]);
    }
    watch.done();
    this.current = null;
    if (end === 'gaveup') {
      // it may still be playing: no other ad opens over it until it ends, and the game is not left
      // muted waiting for an SDK_GAME_START that may never come
      this.stray.mark();
      void shown.then(() => this.stray.clear());
      this.setPaused(false);
    }
    return end === 'over' && type === 'rewarded' && paid;
  }
}
