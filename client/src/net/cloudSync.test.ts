import type { GcIdentity } from '@hk/protocol';
import { describe, expect, it } from 'vitest';
import { newSave, SAVE_VERSION, type SaveData } from '../meta/save';
import { MemoryStore, SAVE_KEY, SaveStore } from '../meta/saveStore';
import { CLOUD_GC_KEY, CLOUD_KEY, CloudSync, SYNC_EVERY_MS, type CloudHost } from './cloudSync';

/** The backend's slots as server/src/cloudSave.ts keeps them: a revision and the save's text,
 *  some keyed on a Game Center player. `down` makes every call fail as with no network. */
function backend() {
  const slots = new Map<string, { rev: number; save: string | null }>();
  const byGc = new Map<string, string>();
  let next = 0;
  const calls: string[] = [];
  const state = { down: false };
  const reply = (status: number, body?: unknown) => new Response(body === undefined ? '' : JSON.stringify(body), { status });
  const make = () => {
    const code = `ABCDEFGHJK${String(next++).padStart(2, '0')}`;
    slots.set(code, { rev: 0, save: null });
    return code;
  };
  const fake = (async (url: string, init: RequestInit) => {
    const op = url.split('/').pop()!;
    calls.push(op);
    if (state.down) throw new TypeError('Failed to fetch');
    const b = JSON.parse(init.body as string) as { game: string; code?: string; base?: number; save?: string; create?: boolean; identity?: GcIdentity };
    if (b.game !== 'monk') return reply(400);
    if (op === 'new') return reply(200, { code: make(), rev: 0 });
    if (op === 'gc') {
      const player = b.identity!.player;
      if (!byGc.has(player) && b.create) byGc.set(player, make());
      const code = byGc.get(player);
      return code ? reply(200, { code, rev: slots.get(code)!.rev }) : reply(404);
    }
    const slot = slots.get(b.code!);
    if (!slot) return reply(404);
    if (op === 'read') return reply(200, slot);
    const version = (JSON.parse(b.save!) as { version: number }).version;
    const held = slot.save ? (JSON.parse(slot.save) as { version: number }).version : 0;
    if (b.base !== slot.rev || version < held) return reply(409, slot);
    slot.rev++;
    slot.save = b.save!;
    return reply(200, { rev: slot.rev });
  }) as unknown as typeof fetch;
  return { slots, byGc, calls, fake, state };
}

function device(server: ReturnType<typeof backend>, save: SaveData, over: Partial<CloudHost> = {}) {
  const kv = new MemoryStore();
  kv.setItem(SAVE_KEY, JSON.stringify(save));
  const store = new SaveStore(kv);
  let reloads = 0;
  let clock = 0;
  const sync = new CloudSync({
    base: 'https://api', game: 'monk', kv, store, reload: () => reloads++, playing: () => false,
    fetch: server.fake, now: () => clock, ...over,
  });
  return { kv, store, sync, reloads: () => reloads, tick: (ms: number) => (clock += ms) };
}

/** Waits for the sync's work in flight (every step is a resolved promise). */
const settle = async (sync: CloudSync) => {
  for (let i = 0; i < 50 && sync.busy(); i++) await new Promise((r) => setTimeout(r, 0));
};

const played = (runs: number, cleared: number, copper: number): SaveData => ({ ...newSave(), firstRunDone: true, runs, cleared, chapter: cleared, copper });

const signed = (player: string): GcIdentity => ({ player, bundle: 'com.gamestao.holykicker', key: 'k', sig: 's', salt: 's', ts: 1 });

describe('CloudSync', () => {
  it('makes a slot of its own at launch and syncs it, with no tap', async () => {
    const server = backend();
    const d = device(server, played(20, 2, 900));
    d.sync.auto();
    await settle(d.sync);
    expect(server.calls).toEqual(['new', 'read', 'write']);
    const code = d.kv.getItem(CLOUD_KEY)!;
    expect(server.slots.get(code)!.save).toContain('"runs":20');
    // the next launch finds the slot by the kept key and makes none
    d.tick(SYNC_EVERY_MS);
    d.sync.auto();
    await settle(d.sync);
    expect(server.calls.slice(3)).toEqual(['read', 'write']);
    expect(d.kv.getItem(CLOUD_KEY)).toBe(code);
  });

  it('fails silently without a network and tries again at the next chance', async () => {
    const server = backend();
    server.state.down = true;
    const d = device(server, played(4, 1, 30));
    expect(await d.sync.syncNow()).toBe('failed');
    expect(d.kv.getItem(CLOUD_KEY)).toBeNull();
    expect(d.store.load().runs).toBe(4);
    server.state.down = false;
    d.tick(SYNC_EVERY_MS);
    d.sync.auto();
    await settle(d.sync);
    expect(server.calls).toEqual(['new', 'new', 'read', 'write']);
    expect(d.kv.getItem(CLOUD_KEY)).not.toBeNull();
  });

  it('makes a new slot when the old one was dropped', async () => {
    const server = backend();
    const d = device(server, played(4, 1, 30));
    await d.sync.syncNow();
    server.slots.clear();
    expect(await d.sync.syncNow()).toBe('noSlot');
    expect(await d.sync.syncNow()).toBe('synced');
    expect(server.slots.size).toBe(1);
  });

  it('finds the Game Center player\'s slot on a new phone and merges it in', async () => {
    const server = backend();
    const old = device(server, played(20, 2, 900));
    old.sync.gcIdentity = async () => signed('T:1');
    await old.sync.syncNow();
    expect(server.calls.slice(0, 1)).toEqual(['gc']);

    const fresh = device(server, played(1, 0, 5));
    fresh.sync.gcIdentity = async () => signed('T:1');
    expect(await fresh.sync.syncNow()).toBe('synced');
    expect(fresh.reloads()).toBe(1);
    expect(fresh.store.load()).toMatchObject({ runs: 20, cleared: 2, copper: 900 });
    expect(fresh.kv.getItem(CLOUD_KEY)).toBe(old.kv.getItem(CLOUD_KEY));
    // the same player next time: no Game Center lookup
    const before = server.calls.length;
    await fresh.sync.syncNow();
    expect(server.calls.slice(before)).toEqual(['read', 'write']);
  });

  it('merges the device\'s own slot into the account\'s when the player signs in', async () => {
    const server = backend();
    // the account's slot, from another phone
    const other = device(server, played(30, 3, 100));
    other.sync.gcIdentity = async () => signed('T:7');
    await other.sync.syncNow();

    // this device plays signed out: a slot of its own
    let identity: GcIdentity | null = null;
    const d = device(server, played(10, 1, 400));
    d.sync.gcIdentity = async () => identity;
    await d.sync.syncNow();
    const own = d.kv.getItem(CLOUD_KEY)!;
    d.store.save({ ...d.store.load(), kills: 77 });

    // Game Center signs in: the sync runs at once, whatever the minute
    identity = signed('T:7');
    d.sync.account();
    await settle(d.sync);
    const account = server.byGc.get('T:7')!;
    expect(d.kv.getItem(CLOUD_KEY)).toBe(account);
    expect(d.kv.getItem(CLOUD_GC_KEY)).toBe('T:7');
    expect(d.store.load()).toMatchObject({ runs: 30, cleared: 3, kills: 77 });
    expect(server.slots.get(own)!.save).toContain('"kills":77');
    expect(server.slots.get(account)!.save).toContain('"kills":77');
    // and the other phone gets this device's progress at its next sync
    await other.sync.syncNow();
    expect(other.store.load().kills).toBe(77);
  });

  it('runs a sign-in that comes during a pass right after it', async () => {
    const server = backend();
    let identity: GcIdentity | null = null;
    const d = device(server, played(2, 0, 0));
    d.sync.gcIdentity = async () => identity;
    d.sync.auto();
    identity = signed('T:2');
    d.sync.account();
    await settle(d.sync);
    await settle(d.sync);
    expect(d.kv.getItem(CLOUD_GC_KEY)).toBe('T:2');
  });

  it('merges again over a write that came in between', async () => {
    const server = backend();
    const a = device(server, played(5, 1, 10));
    await a.sync.syncNow();
    const code = a.kv.getItem(CLOUD_KEY)!;
    // another device wrote after this one read: the 409 brings its save in
    const slot = server.slots.get(code)!;
    const realFetch = server.fake;
    let once = true;
    const b = device(server, played(9, 0, 70), {
      fetch: (async (url: string, init: RequestInit) => {
        const res = await realFetch(url, init);
        if (once && url.endsWith('/read')) {
          once = false;
          slot.rev++;
          slot.save = JSON.stringify({ ...played(30, 3, 5), version: SAVE_VERSION });
        }
        return res;
      }) as typeof fetch,
    });
    b.kv.setItem(CLOUD_KEY, code);
    expect(await b.sync.syncNow()).toBe('synced');
    expect(b.store.load()).toMatchObject({ runs: 30, cleared: 3 });
    expect(server.calls.slice(-3)).toEqual(['read', 'write', 'write']);
  });

  it('leaves a newer build\'s slot alone and never syncs a read-only save', async () => {
    const server = backend();
    const a = device(server, played(5, 1, 10));
    await a.sync.syncNow();
    const code = a.kv.getItem(CLOUD_KEY)!;
    server.slots.get(code)!.save = JSON.stringify({ ...played(1, 0, 0), version: SAVE_VERSION + 1 });
    expect(await a.sync.syncNow()).toBe('update');
    expect(a.store.load().runs).toBe(5);

    const old = device(server, played(1, 0, 0));
    old.kv.setItem(SAVE_KEY, JSON.stringify({ ...played(1, 0, 0), version: SAVE_VERSION + 1 }));
    old.store.load();
    old.kv.setItem(CLOUD_KEY, code);
    const before = server.calls.length;
    expect(await old.sync.syncNow()).toBe('skipped');
    expect(server.calls.length).toBe(before);
  });

  it('syncs in the background at most once a minute, and not during a run', async () => {
    const server = backend();
    let playing = false;
    const d = device(server, played(2, 0, 0), { playing: () => playing });
    d.sync.auto();
    await settle(d.sync);
    const n = server.calls.length;
    d.sync.auto();
    await settle(d.sync);
    expect(server.calls.length).toBe(n);
    d.tick(SYNC_EVERY_MS);
    d.sync.auto();
    await settle(d.sync);
    expect(server.calls.length).toBe(n + 2);
    playing = true;
    d.tick(SYNC_EVERY_MS);
    d.sync.auto();
    await settle(d.sync);
    expect(server.calls.slice(n + 2)).toEqual(['read']);
  });
});
