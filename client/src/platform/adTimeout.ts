// Bounds on an ad host that never answers. Every host's ad is a callback or an event from a remote
// script, and one that never comes would leave the game waiting (and muted) for good: an ad that
// does not come on screen in AD_START_MS is given up as unfilled, and one on screen that never
// reports its end is given up after AD_PLAY_MS (long enough for any real ad, so the game is not
// unmuted under one still playing).

export const AD_START_MS = 15_000;
export const AD_PLAY_MS = 300_000;

export interface AdTimer {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimer: AdTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Calls `give` once if `started` does not come within AD_START_MS, or `done` within AD_PLAY_MS of it. */
export function adWatchdog(give: () => void, timer: AdTimer = realTimer): { started(): void; done(): void } {
  let over = false;
  let handle = timer.set(() => fire(), AD_START_MS);
  const fire = () => {
    if (over) return;
    over = true;
    give();
  };
  return {
    started() {
      if (over) return;
      timer.clear(handle);
      handle = timer.set(() => fire(), AD_PLAY_MS);
    },
    done() {
      over = true;
      timer.clear(handle);
    },
  };
}

/** What `within` rejects with: the host never answered, unlike a refusal it may still send. */
export class AdTimedOut extends Error {
  constructor() {
    super('ad timed out');
  }
}

/** `work`, or a rejection (AdTimedOut) once `ms` pass without it settling. */
export function within<T>(work: Promise<T>, ms: number, timer: AdTimer = realTimer): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = timer.set(() => reject(new AdTimedOut()), ms);
    work.then(
      (v) => {
        timer.clear(handle);
        resolve(v);
      },
      (e: unknown) => {
        timer.clear(handle);
        reject(e);
      },
    );
  });
}

/**
 * An ad the game gave up on may still be playing and report later: its late end must not reach
 * the next ad (a free reward) and a second ad must not open over it. `mark` it when giving up;
 * it is over at its own end (`clear`) or, if that never comes, after AD_PLAY_MS.
 */
export class StrayAd {
  private handle: unknown = null;

  constructor(private readonly timer: AdTimer = realTimer) {}

  mark(): void {
    this.clear();
    this.handle = this.timer.set(() => (this.handle = null), AD_PLAY_MS);
  }

  clear(): void {
    if (this.handle === null) return;
    this.timer.clear(this.handle);
    this.handle = null;
  }

  active(): boolean {
    return this.handle !== null;
  }
}
