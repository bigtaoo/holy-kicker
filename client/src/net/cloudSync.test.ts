import { describe, expect, it } from 'vitest';
import { newSave, SAVE_VERSION, type SaveData } from '../meta/save';
import { MemoryStore, SAVE_KEY, SaveStore } from '../meta/saveStore';
import { CLOUD_KEY, CloudSync, SYNC_EVERY_MS, type CloudHost } from './cloudSync';

/** The backend's slots as server/src/cloudSave.ts keeps them: a revision and the save's text. */
function backend() {
  const slots = new Map<string, { rev: number; save: string | null }>();
  let next = 0;
  const calls: string[] = [];
  const reply = (status: number, body?: unknown) => new Response(body === undefined ? '' : JSON.stringify(body), { status });
  const fake = (async (url: string, init: RequestInit) => {
    const op = url.split('/').pop()!;
    calls.push(op);
    const b = JSON.parse(init.body as string) as { game: string; code?: string; base?: number; save?: string; create?: boolean };
    if (b.game !== 'monk') return reply(400);
    if (op === 'new' || (op === 'gc' && b.create)) {
      const code = `ABCDEFGHJK${String(next++).padStart(2, '0')}`;
      slots.set(code, { rev: 0, save: null });
      return reply(200, { code, rev: 0 });
    }
    if (op === 'gc') return reply(404);
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
  return { slots, calls, fake };
}

function device(server: ReturnType<typeof backend>, save: SaveData, over: Partial<CloudHost> = {}) {
  const kv = new MemoryStore();
  kv.setItem(SAVE_KEY, JSON.stringify(save));
  const store = new SaveStore(kv);
  let reloads = 0;
  let clock = 0;
  const sync = new CloudSync({
    base: 'https://api', game: 'monk', kv, store, reload: () => reloads++, playing: () => false,
    askCode: async () => null, fetch: server.fake, now: () => clock, ...over,
  });
  return { kv, store, sync, reloads: () => reloads, tick: (ms: number) => (clock += ms) };
}

/** Waits for the sync's work in flight (every step is a resolved promise). */
const settle = async (sync: CloudSync) => {
  for (let i = 0; i < 50 && sync.busy(); i++) await new Promise((r) => setTimeout(r, 0));
};

const played = (runs: number, cleared: number, copper: number): SaveData => ({ ...newSave(), firstRunDone: true, runs, cleared, chapter: cleared, copper });

describe('CloudSync', () => {
  it('backs up, restores on another device and merges both ways', async () => {
    const server = backend();
    const phone = device(server, played(20, 2, 900));
    phone.sync.backup();
    await settle(phone.sync);
    expect(phone.sync.status()).toBe('synced');
    const code = phone.sync.code()!;
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    const browser = device(server, played(3, 0, 40), { askCode: async () => code.toLowerCase() });
    browser.sync.restore();
    await settle(browser.sync);
    expect(browser.sync.status()).toBe('restored');
    expect(browser.reloads()).toBe(1);
    expect(browser.store.load()).toMatchObject({ runs: 20, cleared: 2, copper: 900 });
    expect(browser.kv.getItem(CLOUD_KEY)).toBe(code.replace(/-/g, ''));

    // the browser plays on; the phone's next sync pulls that in
    browser.store.save({ ...browser.store.load(), runs: 21, kills: 50 });
    await browser.sync.sync();
    expect(await phone.sync.sync()).toBe('synced');
    expect(phone.store.load()).toMatchObject({ runs: 21, kills: 50, cleared: 2 });
  });

  it('merges again over a write that came in between', async () => {
    const server = backend();
    const a = device(server, played(5, 1, 10));
    a.sync.backup();
    await settle(a.sync);
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
    expect(await b.sync.sync()).toBe('synced');
    expect(b.store.load()).toMatchObject({ runs: 30, cleared: 3 });
    expect(server.calls.slice(-3)).toEqual(['read', 'write', 'write']);
  });

  it('leaves a newer build\'s slot alone and never syncs a read-only save', async () => {
    const server = backend();
    const a = device(server, played(5, 1, 10));
    a.sync.backup();
    await settle(a.sync);
    const code = a.kv.getItem(CLOUD_KEY)!;
    server.slots.get(code)!.save = JSON.stringify({ ...played(1, 0, 0), version: SAVE_VERSION + 1 });
    expect(await a.sync.sync()).toBe('update');
    expect(a.store.load().runs).toBe(5);

    const old = device(server, played(1, 0, 0));
    old.kv.setItem(SAVE_KEY, JSON.stringify({ ...played(1, 0, 0), version: SAVE_VERSION + 1 }));
    old.store.load();
    old.kv.setItem(CLOUD_KEY, code);
    const before = server.calls.length;
    expect(await old.sync.sync()).toBeNull();
    expect(server.calls.length).toBe(before);
  });

  it('turns down a bad or unknown code and keeps the one it had', async () => {
    const server = backend();
    let typed = 'not a code';
    const d = device(server, played(2, 0, 0), { askCode: async () => typed });
    d.sync.restore();
    await settle(d.sync);
    expect(d.sync.status()).toBe('badCode');
    typed = 'ZZZZ-ZZZZ-ZZZZ';
    d.sync.restore();
    await settle(d.sync);
    expect(d.sync.status()).toBe('noSlot');
    expect(d.sync.code()).toBeNull();
  });

  it('syncs in the background at most once a minute, and not during a run', async () => {
    const server = backend();
    let playing = false;
    const d = device(server, played(2, 0, 0), { playing: () => playing });
    d.sync.auto();
    expect(server.calls).toEqual([]);
    d.sync.backup();
    await settle(d.sync);
    const n = server.calls.length;
    d.tick(SYNC_EVERY_MS);
    d.sync.auto();
    await settle(d.sync);
    expect(server.calls.length).toBe(n + 2);
    d.sync.auto();
    await settle(d.sync);
    expect(server.calls.length).toBe(n + 2);
    playing = true;
    d.tick(SYNC_EVERY_MS);
    d.sync.auto();
    await settle(d.sync);
    expect(server.calls.slice(n + 2)).toEqual(['read']);
  });

  it('keys the slot to Game Center when the shell signs the player', async () => {
    const server = backend();
    const d = device(server, played(2, 0, 0));
    d.sync.gcIdentity = async () => ({ player: 'T:1', bundle: 'com.gamestao.holykicker', key: 'k', sig: 's', salt: 's', ts: 1 });
    d.sync.backup();
    await settle(d.sync);
    expect(server.calls[0]).toBe('gc');
    expect(d.sync.status()).toBe('synced');
  });
});
