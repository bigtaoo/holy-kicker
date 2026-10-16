// The Playgama Bridge SDK (v2, https://wiki.playgama.com/playgama/bridge-sdk), wrapped like the
// CrazyGames SDK so nothing in the game can be broken by it: the script is missing in local dev,
// under an adblocker and in tests, so every call is a no-op without it, every throw or rejection
// is swallowed, and initialize() is bounded (BRIDGE_WAIT_MS).
// Bridge storage is asynchronous while the game's KeyValueStore is synchronous, so the keys the
// game uses are read once at boot into a cache (`BridgeStore`); writes land in the cache at once
// and go to Bridge together, one call per batch, as Playgama asks.

export type BridgeAdState = 'loading' | 'opened' | 'closed' | 'failed' | 'rewarded';

type Listener = (...args: unknown[]) => void;

interface Emitter {
  on?: (event: string, cb: Listener) => unknown;
}

/** The SDK as used here; every member optional because it is a remote script. */
export interface BridgeShape {
  initialize?: () => unknown;
  version?: string;
  platform?: Emitter & {
    id?: string;
    language?: string;
    isAudioEnabled?: boolean;
    sendMessage?: (message: string) => unknown;
  };
  storage?: {
    get?: (keys: string[], tryParseJson?: boolean) => unknown;
    set?: (keys: string[], values: string[]) => unknown;
  };
  advertisement?: Emitter & {
    isInterstitialSupported?: boolean;
    isRewardedSupported?: boolean;
    showInterstitial?: (placement?: string) => unknown;
    showRewarded?: (placement?: string) => unknown;
    checkAdBlock?: () => unknown;
  };
  device?: { type?: string };
}

export interface BridgeGlobal {
  bridge?: BridgeShape;
}

/** How long boot waits for initialize(); a blocked platform script never answers. */
export const BRIDGE_WAIT_MS = 5000;

async function settle(fn: () => unknown): Promise<unknown> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

function guard(fn: () => void): void {
  try {
    fn();
  } catch {
    /* the game's problem, never the SDK's */
  }
}

export class PlaygamaBridge {
  private sdk: BridgeShape | null = null;
  private ready = false;
  private adblock: boolean | null = null;

  constructor(
    private readonly global: BridgeGlobal = globalThis as BridgeGlobal,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Runs initialize(); false without the script, on a rejection or after BRIDGE_WAIT_MS. */
  async init(): Promise<boolean> {
    const sdk = this.global.bridge;
    if (!sdk || typeof sdk.initialize !== 'function') return false;
    const done = settle(async () => {
      await sdk.initialize?.();
      return true;
    });
    this.ready = (await Promise.race([done, this.wait(BRIDGE_WAIT_MS).then(() => false)])) === true;
    if (this.ready) this.sdk = sdk;
    return this.ready;
  }

  isReady(): boolean {
    return this.ready;
  }

  /** The platform Bridge runs on ('playgama', 'playgama_sandbox', 'mock', …); null without it. */
  platformId(): string | null {
    const id = this.sdk?.platform?.id;
    return typeof id === 'string' && id !== '' ? id : null;
  }

  version(): string | null {
    const v = this.sdk?.version;
    return typeof v === 'string' ? v : null;
  }

  /** The player's language as the platform reports it (ISO 639-1), null without it. */
  language(): string | null {
    const v = this.sdk?.platform?.language;
    return typeof v === 'string' && v !== '' ? v : null;
  }

  /** 'mobile', 'tablet', 'desktop' or 'tv'; null without it. */
  deviceType(): string | null {
    const v = this.sdk?.device?.type;
    return typeof v === 'string' && v !== '' ? v : null;
  }

  /** game_ready, gameplay_started, player_got_achievement, … */
  send(message: string): void {
    void settle(() => this.sdk?.platform?.sendMessage?.(message));
  }

  /** The platform's pause: true when it asks the game to stop (an ad, the tab hidden). */
  onPause(cb: (paused: boolean) => void): void {
    void settle(() => this.sdk?.platform?.on?.('pause_state_changed', (p) => guard(() => cb(p === true))));
  }

  /** The platform's sound switch: called now with whether to mute, then on every change. */
  onMute(cb: (muted: boolean) => void): void {
    if (!this.sdk) return;
    guard(() => cb(this.sdk?.platform?.isAudioEnabled === false));
    void settle(() => this.sdk?.platform?.on?.('audio_state_changed', (on) => guard(() => cb(on === false))));
  }

  /** Reads `keys` in one call; values come back as strings (objects are stringified again). */
  async load(keys: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const got = await settle(() => this.sdk?.storage?.get?.(keys, false));
    if (!Array.isArray(got)) return out;
    keys.forEach((key, i) => {
      const v: unknown = got[i];
      if (typeof v === 'string') out.set(key, v);
      else if (v !== null && v !== undefined) out.set(key, JSON.stringify(v));
    });
    return out;
  }

  save(entries: Map<string, string>): void {
    void settle(() => this.sdk?.storage?.set?.([...entries.keys()], [...entries.values()]));
  }

  async hasAdblock(): Promise<boolean> {
    if (this.adblock === null) this.adblock = (await settle(() => this.sdk?.advertisement?.checkAdBlock?.())) === true;
    return this.adblock;
  }

  rewardedSupported(): boolean {
    return this.sdk?.advertisement?.isRewardedSupported === true;
  }

  /** One rewarded ad: true only once Bridge says 'rewarded' and the ad then closed. */
  rewarded(started?: () => void): Promise<boolean> {
    return this.show('rewarded_state_changed', (ad) => ad.showRewarded?.(), started);
  }

  /** One interstitial; resolves when it closed or failed (a cooldown fails at once). */
  async interstitial(started?: () => void): Promise<void> {
    if (this.sdk?.advertisement?.isInterstitialSupported !== true) return;
    await this.show('interstitial_state_changed', (ad) => ad.showInterstitial?.(), started);
  }

  private show(event: string, call: (ad: NonNullable<BridgeShape['advertisement']>) => unknown, started?: () => void): Promise<boolean> {
    const ad = this.sdk?.advertisement;
    if (!ad || typeof ad.on !== 'function') return Promise.resolve(false);
    // one ad at a time: an earlier one still waiting for its end is given up as unpaid
    this.listen?.('failed');
    return new Promise<boolean>((resolve) => {
      let paid = false;
      const listen = (state: unknown) => {
        if (state === 'opened') guard(() => started?.());
        else if (state === 'rewarded') paid = true;
        else if (state === 'closed' || state === 'failed') {
          if (this.listen === listen) this.listen = null;
          resolve(paid && state === 'closed');
        }
      };
      this.listen = listen;
      if (!this.subscribed.has(event)) {
        this.subscribed.add(event);
        void settle(() => ad.on?.(event, (s) => this.listen?.(s)));
      }
      try {
        call(ad);
      } catch {
        listen('failed');
      }
    });
  }

  /** The ad in flight's state handler: each event is subscribed once and forwarded here. */
  private listen: ((state: unknown) => void) | null = null;
  private readonly subscribed = new Set<string>();
}

/**
 * The game's synchronous key/value store over Bridge storage: `create` reads every key the game
 * uses in one call, then reads come from the cache and writes are sent together on the next tick.
 */
export class BridgeStore {
  private pending = new Map<string, string>();
  private queued = false;

  private constructor(
    private readonly bridge: PlaygamaBridge,
    private readonly cache: Map<string, string>,
    private readonly later: (fn: () => void) => void,
  ) {}

  static async create(bridge: PlaygamaBridge, keys: string[], later: (fn: () => void) => void = (fn) => setTimeout(fn, 0)): Promise<BridgeStore> {
    return new BridgeStore(bridge, await bridge.load(keys), later);
  }

  getItem(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    this.pending.set(key, value);
    if (this.queued) return;
    this.queued = true;
    this.later(() => this.flush());
  }

  flush(): void {
    this.queued = false;
    if (this.pending.size === 0) return;
    const batch = this.pending;
    this.pending = new Map();
    this.bridge.save(batch);
  }
}
