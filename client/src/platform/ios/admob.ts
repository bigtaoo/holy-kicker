import type { AdPrivacy, Ads } from '../types';
import type { AdKind, AdState, HKNative } from './bridge';

// AdMob through the shell's bridge (docs/ios.md "Ads: AdMob"), as the game's `Ads` and the
// privacy options button. The shell keeps one ad of each kind loaded; a rewarded offer shows only
// once one is, so `rewardedAvailable` waits for the first (the lobby lays itself out again when it
// resolves). An interstitial that is not loaded is skipped, never waited for.

/** How long `rewardedAvailable` waits for a rewarded ad to load. */
export const LOAD_WAIT_MS = 20_000;
/** An ad that has not come on screen by then is given up (the shell always answers, but a page
 *  must never hang on it). */
export const START_WAIT_MS = 10_000;

interface Playing {
  kind: AdKind;
  started?: () => void;
  resolve: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class AdMob implements Ads, AdPrivacy {
  private state: AdState | null;
  private waiting: (() => void)[] = [];
  private playing: Playing | null = null;

  constructor(private readonly native: Partial<HKNative> | null) {
    this.state = typeof native?.adState === 'function' ? clean(native.adState.call(native)) : null;
    native?.onAdState?.call(native, (s) => {
      this.state = clean(s);
      const waiting = this.waiting;
      this.waiting = [];
      for (const wake of waiting) wake();
    });
    native?.onAdEvent?.call(native, (e) => this.event(e));
  }

  async rewardedAvailable(): Promise<boolean> {
    if (!this.canShow()) return false;
    const deadline = Date.now() + LOAD_WAIT_MS;
    for (;;) {
      if (this.state?.rewarded) return true;
      if (this.state?.status === 'off') return false;
      const left = deadline - Date.now();
      if (left <= 0) return false;
      await new Promise<void>((wake) => {
        this.waiting.push(wake);
        setTimeout(wake, left);
      });
    }
  }

  rewarded(started?: () => void): Promise<boolean> {
    return this.show('rewarded', started);
  }

  async midgame(started?: () => void): Promise<void> {
    await this.show('interstitial', started);
  }

  /** The card is adFree.ts's decorator, over this. */
  adFree(): boolean {
    return false;
  }

  /** Google's privacy options, due where its consent form applies (EEA/UK). */
  offered(): boolean {
    return !!this.state?.privacyOptions && typeof this.native?.adPrivacy === 'function';
  }

  open(): void {
    if (this.offered()) this.native?.adPrivacy?.call(this.native);
  }

  /** Why the last load failed, for problem reports; null when the last one worked. */
  error(): string | null {
    return this.state?.error ?? null;
  }

  private canShow(): boolean {
    return typeof this.native?.showAd === 'function';
  }

  private show(kind: AdKind, started?: () => void): Promise<boolean> {
    if (!this.canShow() || !this.state?.[kind] || this.playing) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finish(false), START_WAIT_MS);
      this.playing = { kind, started, resolve, timer };
      this.native?.showAd?.call(this.native, kind);
    });
  }

  private event(e: unknown): void {
    const p = this.playing;
    if (!p || !e || typeof e !== 'object') return;
    const { kind, event, ok } = e as Record<string, unknown>;
    if (kind !== p.kind) return;
    if (event === 'started') {
      // on screen: it runs as long as the player watches
      clearTimeout(p.timer);
      p.started?.();
    } else if (event === 'done') this.finish(ok === true);
  }

  private finish(ok: boolean): void {
    const p = this.playing;
    if (!p) return;
    clearTimeout(p.timer);
    this.playing = null;
    p.resolve(ok);
  }
}

/** The shell's state as the page trusts it: anything malformed reads as no ads. */
function clean(s: unknown): AdState | null {
  if (!s || typeof s !== 'object') return null;
  const r = s as Record<string, unknown>;
  const status = r.status === 'on' || r.status === 'off' ? r.status : 'pending';
  return {
    status,
    rewarded: r.rewarded === true,
    interstitial: r.interstitial === true,
    privacyOptions: r.privacyOptions === true,
    error: typeof r.error === 'string' && r.error ? r.error.slice(0, 120) : null,
  };
}
