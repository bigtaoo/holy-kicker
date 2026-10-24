import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { MemoryVault, MongoVault } from './cloudVault';
import { CLOUD_LIMITS } from './cloudWire';
import { MongoStore } from './mongoStore';
import type { ClientEvent, EventBatch } from './protocol';
import { MemoryStore, type Store } from './store';
import { storeContract, vaultContract, type Open } from './storeContract';

// The store contract against both stores. The Mongo leg needs a Mongo to talk to: CI runs one as a
// service; locally `docker run --rm -d -p 27027:27017 mongo:7` and HK_TEST_MONGO_URL=mongodb://localhost:27027.

const MONGO = process.env.HK_TEST_MONGO_URL;

storeContract('MemoryStore', async () => ({ it: new MemoryStore() }));
vaultContract('MemoryVault', async () => ({ it: new MemoryVault() }));

/** A throwaway database per test, dropped after it. */
function inMongo<T extends { close(): Promise<void> }>(open: (uri: string, db: string) => Promise<T>): Open<T> {
  return async () => {
    const db = `hk_test_${randomBytes(6).toString('hex')}`;
    const it = await open(MONGO!, db);
    return {
      it,
      done: async () => {
        await it.close();
        const client = await MongoClient.connect(MONGO!);
        await client.db(db).dropDatabase();
        await client.close();
      },
    };
  };
}

if (MONGO) {
  storeContract('MongoStore', inMongo((uri, db) => MongoStore.open(uri, db)));
  vaultContract('MongoVault', inMongo((uri, db) => MongoVault.open(uri, db)));
} else {
  describe('MongoStore', () => {
    it.skip('needs HK_TEST_MONGO_URL (a reachable Mongo) to run the store contract against Mongo', () => {});
  });
  console.warn('storeParity: HK_TEST_MONGO_URL is not set, the Mongo leg of the store contract is skipped');
}

/** The same days of play, fed to a store: installs coming back, runs, beacons, a corgi, a tester and an experiment. */
async function feed(s: Store): Promise<void> {
  const DAY0 = Date.parse('2026-10-01T10:00:00Z');
  const at = (day: number) => DAY0 + day * 86_400_000;
  const end = (wave: number, won = false, chapter = 1): ClientEvent => ({ e: 'run_end', t: DAY0, p: { chapter, hard: false, won, wave, gaveUp: false, secs: wave * 20 } });
  const send = (install: string, day: number, events: ClientEvent[], o: Partial<EventBatch> = {}) =>
    s.addEvents({ install: `install-${install}`, session: `${install}-${day}`, host: 'crazygames', build: '1', locale: 'en', events: events.map((e, n) => ({ ...e, t: at(day), n })), ...o }, at(day));
  const session: ClientEvent = { e: 'session', t: DAY0 };
  await send('a', 0, [session, { e: 'run_start', t: DAY0 }, { e: 'tutorial', t: DAY0, p: { step: 'move', secs: 4 } }, end(8), { e: 'run_start', t: DAY0 }, end(50, true), { e: 'alive', t: DAY0, p: { chapter: 1, wave: 6 } }]);
  await send('b', 0, [session, { e: 'run_start', t: DAY0 }, end(3), { e: 'leave', t: DAY0, p: { place: 'results', secs: 90 } }], { exp: 'first20:short' });
  await send('c', 0, [session, { e: 'perf', t: DAY0, p: { fps: 58, tier: 'full' } }], { host: 'web' });
  await send('d', 0, [session, { e: 'run_start', t: DAY0 }, end(12)], { game: 'corgi' });
  await send('t', 0, [session, { e: 'run_start', t: DAY0 }], { tester: true });
  await send('a', 1, [session, { e: 'run_start', t: DAY0 }, end(20, false, 2)]);
  await send('a', 1, [session, { e: 'run_start', t: DAY0 }, end(20, false, 2)]);
  await send('d', 3, [session], { game: 'corgi' });
  await send('a', 7, [session]);
  for (const [host, step, ms] of [['web', 'open_desktop', '0-1s'], ['web', 'open_desktop', null], ['crazygames', 'loaded_touch', '1-3s']] as const) await s.beacon(host, step, '1', at(0), ms);
  await s.beacon('web', 'open_desktop', '1', at(3), null, 'corgi');
}

describe.skipIf(!MONGO)('the two stores, fed the same', () => {
  it('report the same stats', async () => {
    const memory = new MemoryStore();
    const { it: mongo, done } = await inMongo((uri, db) => MongoStore.open(uri, db))();
    try {
      await feed(memory);
      await feed(mongo);
      const now = Date.parse('2026-10-09T12:00:00Z');
      const asks: Parameters<Store['stats']>[] = [[10, now, null], [10, now, 'crazygames'], [10, now, 'web'], [3, now, null, '2026-10-02'], [10, now, null, undefined, 'corgi']];
      for (const ask of asks) expect(await mongo.stats(...ask), JSON.stringify(ask)).toEqual(await memory.stats(...ask));
    } finally {
      await done!();
    }
  });
});

describe.skipIf(!MONGO)('MongoStore and MongoVault in their database', () => {
  it('drop old events, reports and cloud slots by TTL, and open again over their own data', async () => {
    const db = `hk_test_${randomBytes(6).toString('hex')}`;
    const client = await MongoClient.connect(MONGO!);
    try {
      const store = await MongoStore.open(MONGO!, db);
      const vault = await MongoVault.open(MONGO!, db);
      await store.addReport({ install: 'install00001', host: 'web', build: '1', locale: 'en', text: 'kept', device: 'test', chapter: 1, wave: 1, replay: null }, Date.now());
      await vault.create('code1', 'monk', 'gc1', Date.now());
      const ttl = async (name: string) => (await client.db(db).collection(name).indexes()).find((i) => i.key.at === 1)?.expireAfterSeconds;
      expect(await ttl('events')).toBe(90 * 86_400);
      expect(await ttl('reports')).toBe(180 * 86_400);
      expect(await ttl('cloud')).toBe(CLOUD_LIMITS.slotDays * 86_400);
      await store.close();
      await vault.close();
      // a restart builds its indexes again over what is kept
      const again = await MongoStore.open(MONGO!, db);
      const vaultAgain = await MongoVault.open(MONGO!, db);
      expect((await again.reports(5)).map((r) => r.text)).toEqual(['kept']);
      expect(await vaultAgain.byGc('gc1')).toBe('code1');
      await again.close();
      await vaultAgain.close();
    } finally {
      await client.db(db).dropDatabase();
      await client.close();
    }
  });
});
