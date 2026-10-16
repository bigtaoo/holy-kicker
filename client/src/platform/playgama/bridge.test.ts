import { describe, expect, it } from 'vitest';
import { BRIDGE_WAIT_MS, BridgeStore, PlaygamaBridge, type BridgeShape } from './bridge';

type Listener = (...args: unknown[]) => void;

/** An emitter like Bridge's modules: `fire` plays a state change to whoever subscribed. */
function emitter() {
  const subs = new Map<string, Listener[]>();
  return {
    on: (event: string, cb: Listener) => void subs.set(event, [...(subs.get(event) ?? []), cb]),
    fire: (event: string, ...args: unknown[]) => subs.get(event)?.forEach((cb) => cb(...args)),
  };
}

async function make(sdk: BridgeShape) {
  const bridge = new PlaygamaBridge({ bridge: sdk }, () => new Promise(() => {}));
  expect(await bridge.init()).toBe(true);
  return bridge;
}

describe('PlaygamaBridge', () => {
  it('is a no-op without the script', async () => {
    const bridge = new PlaygamaBridge({});
    expect(await bridge.init()).toBe(false);
    expect(bridge.platformId()).toBeNull();
    expect(await bridge.rewarded()).toBe(false);
    await bridge.interstitial();
    expect((await bridge.load(['a'])).size).toBe(0);
  });

  it('gives up on an initialize that never settles', async () => {
    let waited = 0;
    const bridge = new PlaygamaBridge({ bridge: { initialize: () => new Promise(() => {}) } }, async (ms) => void (waited = ms));
    expect(await bridge.init()).toBe(false);
    expect(waited).toBe(BRIDGE_WAIT_MS);
    expect(bridge.isReady()).toBe(false);
  });

  it('pays a rewarded ad only after rewarded, then closed', async () => {
    const ad = emitter();
    let started = 0;
    const bridge = await make({
      initialize: async () => {},
      advertisement: {
        on: ad.on,
        showRewarded: () => {
          ad.fire('rewarded_state_changed', 'loading');
          ad.fire('rewarded_state_changed', 'opened');
          ad.fire('rewarded_state_changed', 'rewarded');
          ad.fire('rewarded_state_changed', 'closed');
        },
      },
    });
    expect(await bridge.rewarded(() => started++)).toBe(true);
    expect(started).toBe(1);
  });

  it('pays nothing for a rewarded ad closed early or failed', async () => {
    const ad = emitter();
    let end = 'closed';
    const bridge = await make({
      initialize: async () => {},
      advertisement: { on: ad.on, showRewarded: () => ad.fire('rewarded_state_changed', end) },
    });
    expect(await bridge.rewarded()).toBe(false);
    end = 'failed';
    expect(await bridge.rewarded()).toBe(false);
  });

  it('ends an interstitial on a cooldown failure', async () => {
    const ad = emitter();
    const bridge = await make({
      initialize: async () => {},
      advertisement: { on: ad.on, isInterstitialSupported: true, showInterstitial: () => ad.fire('interstitial_state_changed', 'failed') },
    });
    await bridge.interstitial();
  });

  it('applies the platform sound switch at once and on change', async () => {
    const platform = emitter();
    const muted: boolean[] = [];
    const bridge = await make({ initialize: async () => {}, platform: { on: platform.on, isAudioEnabled: false } });
    bridge.onMute((m) => muted.push(m));
    platform.fire('audio_state_changed', true);
    expect(muted).toEqual([true, false]);
  });
});

describe('BridgeStore', () => {
  it('reads every key in one call and writes a batch in one call', async () => {
    const gets: string[][] = [];
    const sets: [string[], string[]][] = [];
    const bridge = await make({
      initialize: async () => {},
      storage: {
        get: async (keys) => (gets.push(keys), ['{"a":1}', null, { b: 2 }]),
        set: async (keys, values) => void sets.push([keys, values]),
      },
    });
    const queued: (() => void)[] = [];
    const store = await BridgeStore.create(bridge, ['x', 'y', 'z'], (fn) => queued.push(fn));
    expect(gets).toEqual([['x', 'y', 'z']]);
    expect(store.getItem('x')).toBe('{"a":1}');
    expect(store.getItem('y')).toBeNull();
    expect(store.getItem('z')).toBe('{"b":2}');
    store.setItem('x', '1');
    store.setItem('y', '2');
    store.setItem('x', '3');
    expect(store.getItem('x')).toBe('3');
    expect(queued).toHaveLength(1);
    queued[0]();
    expect(sets).toEqual([[['x', 'y'], ['3', '2']]]);
  });
});

describe('PlaygamaBridge analytics', () => {
  it('sends custom events, and is a no-op on a Bridge without the module', async () => {
    const sent: unknown[] = [];
    const bridge = await make({ initialize: () => {}, analytics: { send: (e, d) => void sent.push([e, d]) } });
    bridge.track('progression_started', { step_index: 1 });
    expect(sent).toEqual([['progression_started', { step_index: 1 }]]);
    const old = await make({ initialize: () => {} });
    expect(() => old.track('x')).not.toThrow();
  });
});
