import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSave } from '../../meta/save';
import { SAVE_KEY, SaveStore } from '../../meta/saveStore';
import { fakeBridge } from '../../testkit/adHosts';
import { browserStubs, fakeBrowser, type FakeBrowser } from '../../testkit/fakeBrowser';
import { PlaygamaBridge } from './bridge';
import { PlaygamaPlatform } from './PlaygamaPlatform';

// The Playgama host's save: through Bridge's storage, written a tick after each change, and
// written at once when the page goes away or the platform pauses the game.

let b: FakeBrowser;

async function platform(o: { ready?: boolean } = {}) {
  const host = fakeBridge();
  const writes: [string[], string[]][] = [];
  const saved = new Map<string, string>([[SAVE_KEY, JSON.stringify({ ...newSave(), copper: 55 })]]);
  host.sdk.storage = {
    get: async (keys: string[]) => keys.map((k) => saved.get(k) ?? null),
    set: async (keys: string[], values: string[]) => void writes.push([keys, values]),
  };
  const bridge = new PlaygamaBridge(o.ready === false ? {} : { bridge: host.sdk }, () => (o.ready === false ? Promise.resolve() : new Promise(() => {})));
  const p = await PlaygamaPlatform.create(bridge);
  const copper = () => writes.filter(([k]) => k.includes(SAVE_KEY)).map(([k, v]) => JSON.parse(v[k.indexOf(SAVE_KEY)]).copper);
  return { host, p, writes, copper };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  b = fakeBrowser();
  for (const [k, v] of Object.entries(browserStubs(b))) vi.stubGlobal(k, v);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PlaygamaPlatform storage', () => {
  it('reads the save through Bridge at boot and writes changes in one call a tick later', async () => {
    const { p, writes, copper } = await platform();
    const store = new SaveStore(p.storage);
    expect(store.load().copper).toBe(55);
    store.save({ ...store.load(), copper: 60 });
    store.save({ ...store.load(), copper: 61 });
    expect(writes).toEqual([]);
    await vi.runAllTimersAsync();
    expect(copper()).toEqual([61]);
  });

  it('writes the save the hide callback makes before the page goes, without waiting a tick', async () => {
    const { p, copper } = await platform();
    const store = new SaveStore(p.storage);
    p.onHide(() => store.save({ ...store.load(), copper: 70 }));
    // a portal swapping the iframe out: no timer runs after this
    b.pageHide();
    expect(copper()).toEqual([70]);
  });

  it('writes it at once on the platform\'s pause too', async () => {
    const { host, p, copper } = await platform();
    const store = new SaveStore(p.storage);
    p.onHide(() => store.save({ ...store.load(), copper: 80 }));
    host.pause(true);
    expect(copper()).toEqual([80]);
    host.pause(false);
    expect(copper()).toEqual([80]);
  });

  it('falls back to localStorage where Bridge never came up', async () => {
    const { p, writes } = await platform({ ready: false });
    p.storage.setItem('hk.x', '1');
    await vi.runAllTimersAsync();
    expect([writes, b.storage.data.get('hk.x')]).toEqual([[], '1']);
  });
});
