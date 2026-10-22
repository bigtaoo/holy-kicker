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

/** `work`, or a rejection once `ms` pass without it settling. */
export function within<T>(work: Promise<T>, ms: number, timer: AdTimer = realTimer): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = timer.set(() => reject(new Error('ad timed out')), ms);
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
