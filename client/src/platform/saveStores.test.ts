import { describe, expect, it } from 'vitest';
import { newSave, SAVE_VERSION } from '../meta/save';
import { BACKUP_KEY, BROKEN_KEY, MemoryStore, SafeStore, SAVE_KEY, SaveStore, type KeyValueStore } from '../meta/saveStore';
import { newerBuildSave } from '../meta/saveFixture';
import { prefixedStore } from '../theme';
import { CrazyGamesSdk } from './crazygames/sdk';
import { MirrorStore } from './ios/mirrorStore';
import { BridgeStore, PlaygamaBridge } from './playgama/bridge';
import { weChatStore } from './wechat/weChatStorage';

// Every host's store under the save rules (docs/cloud-save.md "Older builds"): each one is a
// persistent backing map and `launch()`, the store as the next launch builds it over that map.
interface Host {
  name: string;
  /** What is kept for the next launch, by key. */
  disk: Map<string, string>;
  launch(): Promise<KeyValueStore>;
}

const map = () => new Map<string, string>();
const mapStore = (m: Map<string, string>): KeyValueStore => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) });

function hosts(): Host[] {
  const web = map(), corgi = map(), wechat = map(), cg = map(), pg = map();
  const ios = { local: map(), native: map() };
  return [
    { name: 'web localStorage', disk: web, launch: async () => new SafeStore(mapStore(web)) },
    { name: 'web, a reskin\'s prefixed keys', disk: corgi, launch: async () => new SafeStore(prefixedStore(mapStore(corgi), 'corgi:')) },
    {
      name: 'iOS mirror store', disk: ios.local,
      launch: async () => new SafeStore(new MirrorStore(Object.fromEntries(ios.native), (k, v) => void ios.native.set(k, v), mapStore(ios.local))),
    },
    {
      name: 'WeChat storage', disk: wechat,
      launch: async () => new SafeStore(weChatStore({ getStorageSync: (k) => wechat.get(k) ?? '', setStorageSync: (k, v) => void wechat.set(k, String(v)) })),
    },
    {
      name: 'CrazyGames data module', disk: cg,
      launch: async () => {
        const sdk = new CrazyGamesSdk({ CrazyGames: { SDK: { init: async () => {}, environment: 'crazygames', data: mapStore(cg) } } } as never, () => 0, async () => {});
        await sdk.init();
        return new SafeStore(sdk.dataStore());
      },
    },
    {
      name: 'Playgama Bridge storage', disk: pg,
      launch: async () => {
        const bridge = new PlaygamaBridge({
          bridge: {
            initialize: async () => {},
            storage: { get: async (keys) => keys.map((k) => pg.get(k) ?? null), set: async (keys, values) => keys.forEach((k, i) => pg.set(k, values[i])) },
          },
        }, () => new Promise(() => {}));
        await bridge.init();
        // writes go out on the next tick there; here at once
        return new SafeStore(await BridgeStore.create(bridge, [SAVE_KEY, BACKUP_KEY, BROKEN_KEY], (fn) => fn()));
      },
    },
  ];
}

/** The key a host keeps `key` under on its disk. */
const diskKey = (h: Host, key: string) => (h.name.includes('prefixed') ? `corgi:${key}` : key);

describe.each(hosts())('$name', (h) => {
  it('keeps a newer build\'s save whole through a load and a write', async () => {
    const stored = newerBuildSave();
    h.disk.set(diskKey(h, SAVE_KEY), JSON.stringify(stored));
    const store = new SaveStore(await h.launch());
    const s = store.load();
    store.save({ ...s, copper: 300 });
    expect(JSON.parse(h.disk.get(diskKey(h, SAVE_KEY))!)).toEqual({ ...stored, copper: 300 });
  });

  it('never writes over a save of a newer version', async () => {
    const text = JSON.stringify({ ...newSave(), version: SAVE_VERSION + 3, copper: 12 });
    h.disk.set(diskKey(h, SAVE_KEY), text);
    const store = new SaveStore(await h.launch());
    store.save({ ...store.load(), copper: 99 });
    expect(h.disk.get(diskKey(h, SAVE_KEY))).toBe(text);
    expect(new SaveStore(await h.launch()).load().copper).toBe(12);
  });

  it('restores the last good copy when the main one is broken', async () => {
    h.disk.clear();
    new SaveStore(await h.launch()).save({ ...newSave(), jade: 31 });
    h.disk.set(diskKey(h, SAVE_KEY), '{"jade":');
    const store = new SaveStore(await h.launch());
    expect(store.load().jade).toBe(31);
    expect(h.disk.get(diskKey(h, BROKEN_KEY))).toBe('{"jade":');
  });
});

describe('iOS mirror store', () => {
  it('restores from the native copy and its backup when WebKit lost its storage', () => {
    const native = new MemoryStore();
    const mirror = new MirrorStore({}, (k, v) => native.setItem(k, v), new MemoryStore());
    new SaveStore(mirror).save({ ...newSave(), copper: 8 });
    const saved = { [SAVE_KEY]: 'not json', [BACKUP_KEY]: native.getItem(BACKUP_KEY)! };
    expect(new SaveStore(new MirrorStore(saved, () => {}, new MemoryStore())).load().copper).toBe(8);
  });
});
