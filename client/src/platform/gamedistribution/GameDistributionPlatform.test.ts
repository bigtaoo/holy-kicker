import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserGlobals } from '../../testkit/adHosts';
import { GameDistributionPlatform } from './GameDistributionPlatform';
import { COMPLETE_WAIT_MS, GdSdk, type GdGlobal } from './sdk';

// The GameDistribution host: offline, no links, its ads through the SDK and its pause as a hide.

function fakeSdk() {
  const shows: { type?: string; resolve(): void }[] = [];
  const g: GdGlobal = {
    gdsdk: {
      showAd: (type) => new Promise<void>((resolve) => shows.push({ type, resolve })),
      preloadAd: () => Promise.resolve(),
    },
  };
  const sdk = new GdSdk(g, 'abc123');
  const emit = (name: string) => g.GD_OPTIONS?.onEvent({ name });
  return { sdk, shows, emit };
}

async function platform() {
  const gd = fakeSdk();
  const made = GameDistributionPlatform.create(gd.sdk);
  gd.emit('SDK_READY');
  return { gd, p: await made };
}

beforeEach(() => {
  vi.useFakeTimers();
  const browser = browserGlobals();
  vi.stubGlobal('location', browser.location);
  vi.stubGlobal('document', browser.document);
  vi.stubGlobal('window', browser.window);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GameDistributionPlatform', () => {
  it('names itself, never reaches the backend and opens no page', async () => {
    const { p } = await platform();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    p.openUrl('https://example.com');
    expect([p.host, p.backendBlocked, open.mock.calls.length]).toEqual(['gamedistribution', true, 0]);
  });

  it('plays its ads through the SDK, paying a rewarded one only when watched', async () => {
    const { gd, p } = await platform();
    expect(await p.ads.rewardedAvailable()).toBe(true);
    const reward = p.ads.rewarded();
    gd.emit('SDK_GAME_PAUSE');
    gd.emit('SDK_REWARDED_WATCH_COMPLETE');
    gd.shows[0]?.resolve();
    expect(await reward).toBe(true);
    const inter = p.ads.midgame();
    gd.shows[1]?.resolve();
    await inter;
    await vi.advanceTimersByTimeAsync(COMPLETE_WAIT_MS);
    expect([gd.shows.map((s) => s.type), p.ads.adFree()]).toEqual([['rewarded', 'interstitial'], false]);
  });

  it('treats the SDK pausing the game as going to the background', async () => {
    const { gd, p } = await platform();
    const hides = vi.fn();
    p.onHide(hides);
    gd.emit('SDK_GAME_PAUSE');
    gd.emit('SDK_GAME_START');
    expect(hides).toHaveBeenCalledTimes(1);
  });
});
