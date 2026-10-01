// The CrazyGames SDK v3, wrapped so nothing in the game can be broken by it. Adapted from
// D:\daydayup\client\src\platform\crazygames\sdk.ts, which carries the live findings:
//  - the SDK is missing in local dev, under an adblocker and in tests, so every call is a
//    no-op without it, and every throw or rejection is swallowed (`settle`);
//  - its init() can simply never settle, so every await is bounded (SDK_WAIT_MS);
//  - `environment` appears only after init has run, so it is polled, and v2's
//    promise-returning getEnvironment() is read too;
//  - an unfilled ad arrives as adError, which is normal and resolves false.
// The data module (`SDK.data`) is a synchronous localStorage look-alike: cloud storage for
// signed-in players, local for guests, carried over on sign-in. It only exists after init,
// which is why boot waits for the SDK before reading the save.

export type CgEnvironment = 'local' | 'crazygames' | 'disabled';
export type CgAdType = 'midgame' | 'rewarded';

export interface CgAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

export interface CgUser {
  username?: unknown;
}

/** The SDK as used here; every member optional because it is a remote script. */
export interface CgSdkShape {
  environment?: string;
  getEnvironment?: () => unknown;
  init?: () => unknown;
  game?: {
    loadingStart?: () => unknown;
    loadingStop?: () => unknown;
    gameplayStart?: () => unknown;
    gameplayStop?: () => unknown;
    happytime?: () => unknown;
  };
  ad?: {
    requestAd?: (type: CgAdType, callbacks: CgAdCallbacks) => unknown;
    hasAdblock?: () => unknown;
  };
  user?: {
    getUser?: () => unknown;
    addAuthListener?: (listener: (user: unknown) => void) => unknown;
  };
  data?: {
    getItem?: (key: string) => unknown;
    setItem?: (key: string, value: string) => unknown;
  };
}

export interface CgGlobal {
  CrazyGames?: { SDK?: CgSdkShape };
}

/** How long boot waits for the script and its init; a blocked request never arrives. */
export const SDK_WAIT_MS = 3000;
const POLL_MS = 50;

/** Runs fn, awaiting a promise, and turns every failure into undefined. */
export async function settle(fn: () => unknown): Promise<unknown> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/** Calls a game hook from an SDK callback without letting its throw reach the SDK. */
function guard(fn: (() => void) | undefined): void {
  try {
    fn?.();
  } catch {
    /* the hook's problem, never the ad's */
  }
}

function isEnvironment(v: unknown): v is CgEnvironment {
  return v === 'local' || v === 'crazygames' || v === 'disabled';
}

export class CrazyGamesSdk {
  private sdk: CgSdkShape | null = null;
  private env: CgEnvironment = 'disabled';
  private adblock: boolean | null = null;

  constructor(
    private readonly global: CgGlobal = globalThis as CgGlobal,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Waits for the script, runs its init and reads the environment; 'disabled' on every
   *  failure, never a rejection, and never longer than SDK_WAIT_MS. */
  async init(): Promise<CgEnvironment> {
    const deadline = this.now() + SDK_WAIT_MS;
    for (;;) {
      const sdk = this.global.CrazyGames?.SDK;
      if (sdk) {
        this.sdk = sdk;
        break;
      }
      if (this.now() >= deadline) return 'disabled';
      await this.sleep(POLL_MS);
    }
    await this.until(deadline, settle(() => this.sdk?.init?.()));
    for (;;) {
      const prop = this.sdk?.environment;
      if (isEnvironment(prop)) return (this.env = prop);
      const asked = await this.until(deadline, settle(() => this.sdk?.getEnvironment?.()));
      if (isEnvironment(asked)) return (this.env = asked);
      if (this.now() >= deadline) return 'disabled';
      await this.sleep(POLL_MS);
    }
  }

  /** The value of `work`, or undefined once `deadline` passes. */
  private async until(deadline: number, work: Promise<unknown>): Promise<unknown> {
    let done = false;
    let value: unknown;
    void work.then((v) => {
      value = v;
      done = true;
    });
    for (;;) {
      await Promise.resolve();
      if (done || this.now() >= deadline) return value;
      await this.sleep(POLL_MS);
    }
  }

  environment(): CgEnvironment {
    return this.env;
  }

  /** A real portal page or a whitelisted dev domain ('local' serves test ads). */
  isEnabled(): boolean {
    return this.env === 'local' || this.env === 'crazygames';
  }

  loadingStart(): void {
    void settle(() => this.sdk?.game?.loadingStart?.());
  }

  loadingStop(): void {
    void settle(() => this.sdk?.game?.loadingStop?.());
  }

  gameplayStart(): void {
    void settle(() => this.sdk?.game?.gameplayStart?.());
  }

  gameplayStop(): void {
    void settle(() => this.sdk?.game?.gameplayStop?.());
  }

  happytime(): void {
    void settle(() => this.sdk?.game?.happytime?.());
  }

  /** One ad; true only if it finished. A synchronous throw means no callback will come. */
  async requestAd(type: CgAdType, hooks: CgAdCallbacks = {}): Promise<boolean> {
    const fn = this.sdk?.ad?.requestAd;
    if (!this.isEnabled() || typeof fn !== 'function') return false;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };
      try {
        fn.call(this.sdk?.ad, type, {
          adStarted: () => guard(hooks.adStarted),
          adFinished: () => {
            guard(hooks.adFinished);
            finish(true);
          },
          adError: (error: unknown) => {
            guard(() => hooks.adError?.(error));
            finish(false);
          },
        });
      } catch {
        guard(() => hooks.adError?.(new Error('requestAd threw')));
        finish(false);
      }
    });
  }

  /** Cached after the first answer; an unanswerable probe says false (offer, let it fail). */
  async hasAdblock(): Promise<boolean> {
    if (this.adblock !== null) return this.adblock;
    const fn = this.sdk?.ad?.hasAdblock;
    if (typeof fn !== 'function') return false;
    this.adblock = (await settle(() => fn.call(this.sdk?.ad))) === true;
    return this.adblock;
  }

  /** The signed-in user's name, null for a guest or on any failure. */
  async userName(): Promise<string | null> {
    const user = (await settle(() => this.sdk?.user?.getUser?.())) as CgUser | null | undefined;
    return typeof user?.username === 'string' && user.username !== '' ? user.username : null;
  }

  onAuthChange(listener: () => void): void {
    void settle(() => this.sdk?.user?.addAuthListener?.(() => guard(listener)));
  }

  /** The data module as a key/value store, or null when this page has none. */
  dataStore(): { getItem(key: string): string | null; setItem(key: string, value: string): void } | null {
    const data = this.sdk?.data;
    if (!this.isEnabled() || typeof data?.getItem !== 'function' || typeof data.setItem !== 'function') return null;
    return {
      getItem: (key) => {
        const v = data.getItem?.(key);
        return typeof v === 'string' ? v : null;
      },
      setItem: (key, value) => void data.setItem?.(key, value),
    };
  }
}
