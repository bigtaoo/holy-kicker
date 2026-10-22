import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_PLAY_MS, AD_START_MS, adWatchdog, within } from './adTimeout';
import { CrazyGamesSdk, type CgAdCallbacks } from './crazygames/sdk';
import { PlaygamaBridge } from './playgama/bridge';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('adWatchdog', () => {
  it('gives up an ad that never starts, once', () => {
    const give = vi.fn();
    adWatchdog(give);
    vi.advanceTimersByTime(AD_START_MS - 1);
    expect(give).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AD_PLAY_MS);
    expect(give).toHaveBeenCalledTimes(1);
  });

  it('gives an ad on screen the long bound, and nothing once it is done', () => {
    const give = vi.fn();
    const w = adWatchdog(give);
    vi.advanceTimersByTime(AD_START_MS - 1);
    w.started();
    vi.advanceTimersByTime(AD_PLAY_MS - 1);
    expect(give).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(give).toHaveBeenCalledTimes(1);
    const quiet = vi.fn();
    adWatchdog(quiet).done();
    vi.advanceTimersByTime(AD_PLAY_MS * 2);
    expect(quiet).not.toHaveBeenCalled();
  });

  it('rejects work that never settles', async () => {
    const late = within(new Promise(() => {}), 100);
    vi.advanceTimersByTime(100);
    await expect(late).rejects.toThrow();
    await expect(within(Promise.resolve(3), 100)).resolves.toBe(3);
  });
});

describe('ad hosts that never answer', () => {
  it('CrazyGames: a request with no callback is no ad, and a late start does not mute', async () => {
    let cb: CgAdCallbacks | null = null;
    const cg = new CrazyGamesSdk({ CrazyGames: { SDK: { environment: 'crazygames', ad: { requestAd: (_t, c) => void (cb = c) } } } }, () => 0, async () => undefined);
    await cg.init();
    const started = vi.fn();
    const ad = cg.requestAd('rewarded', { adStarted: started });
    vi.advanceTimersByTime(AD_START_MS);
    expect(await ad).toBe(false);
    cb!.adStarted?.();
    cb!.adFinished?.();
    expect(started).not.toHaveBeenCalled();
  });

  it('Playgama: an ad with no end state is unpaid', async () => {
    let send: ((s: unknown) => void) | null = null;
    const bridge = new PlaygamaBridge({ bridge: { initialize: async () => undefined, advertisement: { on: (_e: string, fn: (s: unknown) => void) => void (send = fn), showRewarded: () => undefined } } });
    await bridge.init();
    const started = vi.fn();
    const ad = bridge.rewarded(started);
    send!('opened');
    vi.advanceTimersByTime(AD_PLAY_MS);
    expect(await ad).toBe(false);
    send!('opened');
    expect(started).toHaveBeenCalledTimes(1);
  });
});
