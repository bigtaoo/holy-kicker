import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchAd } from '../../testkit/adHosts';
import { AD_PLAY_MS, AD_START_MS } from '../adTimeout';
import { COMPLETE_WAIT_MS, GdSdk, PRELOAD_WAIT_MS, SDK_SRC, SDK_WAIT_MS, type GdAdType, type GdGlobal, type GdScript } from './sdk';

// The GameDistribution SDK wrapper against a fake SDK: its launch, the pause brackets and when a
// rewarded ad pays.

function fakeGd(o: { preload?: 'ok' | 'none' | 'hang' } = {}) {
  const scripts: GdScript[] = [];
  const shows: { type?: GdAdType; resolve(): void; reject(e: unknown): void }[] = [];
  const g: GdGlobal = {
    document: {
      getElementById: (id) => scripts.find((s) => s.id === id) ?? null,
      createElement: () => ({ id: '', src: '', async: false, onerror: null }),
      head: { appendChild: (el) => scripts.push(el as GdScript) },
    },
  };
  const emit = (name: string) => g.GD_OPTIONS?.onEvent({ name });
  const ready = () => {
    g.gdsdk = {
      showAd: (type) => new Promise<void>((resolve, reject) => shows.push({ type, resolve, reject })),
      preloadAd: () => (o.preload ?? 'ok') === 'ok' ? Promise.resolve() : o.preload === 'none' ? Promise.reject(new Error('no ad')) : new Promise(() => {}),
    };
    emit('SDK_READY');
  };
  return { g, scripts, shows, emit, ready };
}

async function loaded(o: Parameters<typeof fakeGd>[0] = {}) {
  const gd = fakeGd(o);
  const sdk = new GdSdk(gd.g, 'abc123');
  const how = sdk.load();
  gd.ready();
  expect(await how).toBe('ready');
  return { gd, sdk };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GdSdk launch', () => {
  it('puts its options on the window and adds the script once, then waits for SDK_READY', async () => {
    const { gd, sdk } = await loaded();
    expect([gd.g.GD_OPTIONS?.gameId, gd.scripts.map((s) => [s.id, s.src])]).toEqual(['abc123', [['gamedistribution-jssdk', SDK_SRC]]]);
    void sdk.load();
    expect(gd.scripts).toHaveLength(1);
    expect(sdk.isReady()).toBe(true);
  });

  it('gives up on a script that fails, never answers, or a game with no id yet', async () => {
    const failed = fakeGd();
    const sdk = new GdSdk(failed.g, 'abc123');
    const how = sdk.load();
    failed.scripts[0]?.onerror?.();
    expect(await how).toBe('error');
    const silent = new GdSdk(fakeGd().g, 'abc123').load();
    await vi.advanceTimersByTimeAsync(SDK_WAIT_MS);
    expect(await silent).toBe('timeout');
    const none = fakeGd();
    expect(await new GdSdk(none.g, '').load()).toBe('noid');
    expect([none.scripts, none.g.GD_OPTIONS]).toEqual([[], undefined]);
  });

  it('plays nothing and offers nothing before the SDK is ready', async () => {
    const sdk = new GdSdk(fakeGd().g, 'abc123');
    expect([await sdk.rewardedReady(), await sdk.showAd('rewarded')]).toEqual([false, false]);
  });
});

describe('GdSdk ads', () => {
  it('pays a rewarded ad watched to its end, on screen from SDK_GAME_PAUSE', async () => {
    const { gd, sdk } = await loaded();
    const paused: boolean[] = [];
    sdk.onPause((p) => paused.push(p));
    const ad = watchAd((s) => sdk.showAd('rewarded', s));
    expect(gd.shows.map((s) => s.type)).toEqual(['rewarded']);
    gd.emit('SDK_GAME_PAUSE');
    expect(ad.onScreen()).toBe(true);
    gd.emit('SDK_REWARDED_WATCH_COMPLETE');
    gd.emit('SDK_GAME_START');
    gd.shows[0]?.resolve();
    expect([await ad.result, paused]).toEqual([true, [true, false]]);
  });

  it('waits a moment for a completion that comes after the ad is over', async () => {
    const { gd, sdk } = await loaded();
    const ad = watchAd((s) => sdk.showAd('rewarded', s));
    gd.emit('SDK_GAME_PAUSE');
    gd.shows[0]?.resolve();
    await vi.advanceTimersByTimeAsync(COMPLETE_WAIT_MS / 2);
    gd.emit('SDK_REWARDED_WATCH_COMPLETE');
    expect(await ad.result).toBe(true);
  });

  it('pays nothing for a rewarded ad closed early or failed, or for an interstitial', async () => {
    const { gd, sdk } = await loaded();
    const closed = watchAd((s) => sdk.showAd('rewarded', s));
    gd.emit('SDK_GAME_PAUSE');
    gd.shows[0]?.resolve();
    await vi.advanceTimersByTimeAsync(COMPLETE_WAIT_MS);
    expect(await closed.result).toBe(false);
    const failed = sdk.showAd('rewarded');
    gd.shows[1]?.reject(new Error('no fill'));
    expect(await failed).toBe(false);
    const inter = watchAd((s) => sdk.showAd('interstitial', s));
    gd.emit('SDK_GAME_PAUSE');
    gd.shows[2]?.resolve();
    expect([await inter.result, inter.starts(), gd.shows[2]?.type]).toEqual([false, 1, 'interstitial']);
  });

  it('plays one ad at a time', async () => {
    const { gd, sdk } = await loaded();
    const first = sdk.showAd('rewarded');
    expect(await sdk.showAd('interstitial')).toBe(false);
    gd.shows[0]?.resolve();
    await vi.advanceTimersByTimeAsync(COMPLETE_WAIT_MS);
    await first;
    expect(gd.shows).toHaveLength(1);
  });

  it('gives up an ad that never starts or never ends, unpauses the game, and opens none over it', async () => {
    const { gd, sdk } = await loaded();
    const paused: boolean[] = [];
    sdk.onPause((p) => paused.push(p));
    const silent = sdk.showAd('rewarded');
    await vi.advanceTimersByTimeAsync(AD_START_MS);
    expect(await silent).toBe(false);
    // the given-up ad may still be on screen: nothing else opens until it ends
    expect(await sdk.showAd('interstitial')).toBe(false);
    gd.shows[0]?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    const stuck = sdk.showAd('rewarded');
    gd.emit('SDK_GAME_PAUSE');
    gd.emit('SDK_REWARDED_WATCH_COMPLETE');
    await vi.advanceTimersByTimeAsync(AD_PLAY_MS);
    expect([await stuck, paused]).toEqual([false, [true, false]]);
  });

  it('offers a rewarded ad only when preloading finds one in time', async () => {
    expect(await (await loaded()).sdk.rewardedReady()).toBe(true);
    expect(await (await loaded({ preload: 'none' })).sdk.rewardedReady()).toBe(false);
    const hang = (await loaded({ preload: 'hang' })).sdk.rewardedReady();
    await vi.advanceTimersByTimeAsync(PRELOAD_WAIT_MS);
    expect(await hang).toBe(false);
  });
});
