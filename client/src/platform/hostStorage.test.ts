import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, SaveStore } from '../meta/saveStore';
import { fakeCrazyGames, fakeHkNative } from '../testkit/adHosts';
import { browserStubs, fakeBrowser, FakeLocalStorage, type FakeBrowser } from '../testkit/fakeBrowser';
import { CrazyGamesPlatform } from './crazygames/CrazyGamesPlatform';
import { CrazyGamesSdk } from './crazygames/sdk';
import { IosPlatform } from './ios/IosPlatform';

// Where the CrazyGames and iOS hosts keep the save, and what happens when that store refuses a
// write: CrazyGames' data module (localStorage without the SDK), and iOS's localStorage mirrored
// into the shell's UserDefaults.

let b: FakeBrowser;
function page(storage = new FakeLocalStorage()) {
  b = fakeBrowser({ storage });
  for (const [k, v] of Object.entries(browserStubs(b))) vi.stubGlobal(k, v);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  page();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function crazyGames(sdk: unknown) {
  let t = 0;
  return CrazyGamesPlatform.create(new CrazyGamesSdk({ CrazyGames: { SDK: sdk } } as never, () => t, async (ms) => void (t += ms)));
}

describe('CrazyGamesPlatform storage', () => {
  it('keeps the save in the data module, not the page\'s localStorage', async () => {
    const host = fakeCrazyGames();
    const writes: string[] = [];
    const data = host.sdk.data!;
    const set = data.setItem!.bind(data);
    data.setItem = (k: string, v: string) => {
      writes.push(k);
      set(k, v);
    };
    const store = new SaveStore((await crazyGames(host.sdk)).storage);
    store.save({ ...store.load(), copper: 12 });
    expect(writes).toContain(SAVE_KEY);
    expect(b.storage.data.has(SAVE_KEY)).toBe(false);
    expect(new SaveStore((await crazyGames(host.sdk)).storage).load().copper).toBe(12);
  });

  it('plays on from memory when the data module throws on a write', async () => {
    const host = fakeCrazyGames();
    host.sdk.data!.setItem = () => {
      throw new Error('quota');
    };
    const store = new SaveStore((await crazyGames(host.sdk)).storage);
    expect(() => store.save({ ...store.load(), copper: 3 })).not.toThrow();
    expect(store.load().copper).toBe(3);
  });

  it('falls back to localStorage without the SDK (an adblocker took it)', async () => {
    const store = new SaveStore((await crazyGames(undefined)).storage);
    store.save({ ...store.load(), copper: 8 });
    expect(JSON.parse(b.storage.data.get(SAVE_KEY)!).copper).toBe(8);
  });
});

describe('IosPlatform storage', () => {
  function shell(saved: Record<string, string> = {}) {
    const s = fakeHkNative();
    const pushed = new Map<string, string>();
    s.native.saved = saved;
    s.native.save = (k: string, v: string) => void pushed.set(k, v);
    return { native: s.native, pushed };
  }

  it('writes the save to localStorage and the shell\'s copy, and restores from the copy when WebKit lost it', () => {
    const { native, pushed } = shell();
    const store = new SaveStore(new IosPlatform(native).storage);
    store.save({ ...store.load(), copper: 21 });
    expect(JSON.parse(pushed.get(SAVE_KEY)!).copper).toBe(21);
    expect(JSON.parse(b.storage.data.get(SAVE_KEY)!).copper).toBe(21);
    // iOS cleared the web view's storage; the shell hands its copy over at launch
    page();
    const back = shell(Object.fromEntries(pushed));
    expect(new SaveStore(new IosPlatform(back.native).storage).load().copper).toBe(21);
  });

  it('still reaches the shell\'s copy when WebKit refuses the write, and never crashes', () => {
    const disk = new FakeLocalStorage();
    disk.mode = 'readonly';
    page(disk);
    const { native, pushed } = shell();
    const store = new SaveStore(new IosPlatform(native).storage);
    expect(() => store.save({ ...store.load(), copper: 5 })).not.toThrow();
    expect([store.load().copper, JSON.parse(pushed.get(SAVE_KEY)!).copper]).toEqual([5, 5]);
  });

  it('runs on localStorage alone in a shell too old to keep a copy', () => {
    const s = fakeHkNative();
    delete s.native.saved;
    const store = new SaveStore(new IosPlatform(s.native).storage);
    store.save({ ...store.load(), copper: 2 });
    expect(JSON.parse(b.storage.data.get(SAVE_KEY)!).copper).toBe(2);
  });
});
