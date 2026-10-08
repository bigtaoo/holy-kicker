import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdEvent, AdKind, AdState, HKNative } from './bridge';
import { AdMob, LOAD_WAIT_MS, START_WAIT_MS } from './admob';

// AdMob as the page sees it through the shell's bridge: which ads to offer, and one ad at a time.

const ON: AdState = { status: 'on', rewarded: true, interstitial: true, privacyOptions: false, error: null };

function shell(initial: AdState | null) {
  let state: ((s: AdState) => void) | null = null;
  let event: ((e: AdEvent) => void) | null = null;
  const shown: AdKind[] = [];
  let privacy = 0;
  const native: Partial<HKNative> = {
    adState: () => initial,
    onAdState: (cb) => (state = cb),
    onAdEvent: (cb) => (event = cb),
    showAd: (kind) => shown.push(kind),
    adPrivacy: () => privacy++,
  };
  return {
    native,
    shown,
    privacy: () => privacy,
    push: (s: unknown) => state?.(s as AdState),
    event: (e: unknown) => event?.(e as AdEvent),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AdMob', () => {
  it('offers nothing without the bridge', async () => {
    for (const native of [null, {}]) {
      const ads = new AdMob(native);
      expect(await ads.rewardedAvailable()).toBe(false);
      expect(await ads.rewarded()).toBe(false);
      expect(ads.offered()).toBe(false);
    }
  });

  it('waits for the first rewarded ad to load, and no longer than LOAD_WAIT_MS', async () => {
    const s = shell({ ...ON, status: 'pending', rewarded: false });
    const later = new AdMob(s.native).rewardedAvailable();
    s.push({ ...ON, rewarded: false });
    s.push(ON);
    expect(await later).toBe(true);

    const never = new AdMob(shell({ ...ON, rewarded: false }).native).rewardedAvailable();
    await vi.advanceTimersByTimeAsync(LOAD_WAIT_MS);
    expect(await never).toBe(false);
  });

  it('gives up at once when ads may not be requested', async () => {
    const s = shell(null);
    const available = new AdMob(s.native).rewardedAvailable();
    s.push({ ...ON, status: 'off', rewarded: false });
    expect(await available).toBe(false);
  });

  it('pays a rewarded ad only when the shell says it was earned, after it is gone', async () => {
    const s = shell(ON);
    const ads = new AdMob(s.native);
    let started = 0;
    const paid = ads.rewarded(() => started++);
    expect(s.shown).toEqual(['rewarded']);
    s.event({ kind: 'rewarded', event: 'started', ok: false });
    expect(started).toBe(1);
    // the ad runs as long as the player watches it
    await vi.advanceTimersByTimeAsync(START_WAIT_MS * 3);
    s.event({ kind: 'rewarded', event: 'done', ok: true });
    expect(await paid).toBe(true);

    const skipped = ads.rewarded();
    s.event({ kind: 'rewarded', event: 'done', ok: false });
    expect(await skipped).toBe(false);
  });

  it('shows one ad at a time, only a loaded one, and never hangs on a silent shell', async () => {
    const s = shell({ ...ON, interstitial: false });
    const ads = new AdMob(s.native);
    await ads.midgame();
    expect(s.shown).toEqual([]);

    const first = ads.rewarded();
    expect(await ads.rewarded()).toBe(false);
    expect(s.shown).toEqual(['rewarded']);
    // an event for another kind is not this ad's
    s.event({ kind: 'interstitial', event: 'done', ok: true });
    await vi.advanceTimersByTimeAsync(START_WAIT_MS);
    expect(await first).toBe(false);
  });

  it('offers the privacy options only where the shell says they are due', () => {
    const s = shell(ON);
    const ads = new AdMob(s.native);
    ads.open();
    expect([ads.offered(), s.privacy()]).toEqual([false, 0]);
    s.push({ ...ON, privacyOptions: true });
    ads.open();
    expect([ads.offered(), s.privacy()]).toEqual([true, 1]);
  });

  it('reads a malformed state as no ads, and keeps the load error short', () => {
    const s = shell(null);
    const ads = new AdMob(s.native);
    s.push({ status: 'yes', rewarded: 1, privacyOptions: 'true', error: 'x'.repeat(500) });
    expect([ads.offered(), ads.error()?.length]).toEqual([false, 120]);
  });
});
