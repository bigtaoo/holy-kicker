import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MongoClient } from 'mongodb';
import { afterEach, describe, expect, it } from 'vitest';
import { openApp, type App } from './app';
import { MongoStore } from './mongoStore';
import { MemoryStore } from './store';

// index.ts's wiring, started as the process starts it but on a free port: the store chosen from the
// environment and the routes mounted behind the handler.

const PAGES = { dash: '<p>dash</p>', privacyEn: '<p>privacy</p>', privacyZh: '<p>隐私</p>' };
const quiet = () => {};
let server: Server | null = null;
let app: App | null = null;

afterEach(async () => {
  await new Promise((done) => (server ? server.close(done) : done(undefined)));
  await app?.store.close();
  server = app = null;
});

async function listen(env: NodeJS.ProcessEnv): Promise<string> {
  app = await openApp(env, PAGES, quiet);
  server = createServer(app.listener);
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('the server wiring', () => {
  it('keeps everything in memory without a Mongo, and answers the routes and its pages', async () => {
    const base = await listen({});
    expect(app!.kind).toBe('memory');
    expect(app!.store).toBeInstanceOf(MemoryStore);
    expect((await fetch(`${base}/v1/boards/c1`)).status).toBe(200);
    expect(await (await fetch(`${base}/dash`)).text()).toBe(PAGES.dash);
    const pre = await fetch(`${base}/v1/events`, { method: 'OPTIONS' });
    expect([pre.status, pre.headers.get('access-control-allow-origin')]).toEqual([204, '*']);
    // the admin routes answer 401 without HK_ADMIN_KEY
    expect((await fetch(`${base}/v1/stats`)).status).toBe(401);
    expect((await fetch(`${base}/nothing-here`)).status).toBe(404);
  });

  it('refuses a Mongo without the board tags\' salt', async () => {
    await expect(openApp({ HK_MONGO_URI: 'mongodb://localhost:1' }, PAGES, quiet)).rejects.toThrow('HK_TAG_SALT');
  });

  it.skipIf(!process.env.HK_TEST_MONGO_URL)('opens the Mongo store from HK_MONGO_URI', async () => {
    const db = `hk_test_${randomBytes(6).toString('hex')}`;
    try {
      const base = await listen({ HK_MONGO_URI: process.env.HK_TEST_MONGO_URL, HK_MONGO_DB: db, HK_TAG_SALT: 'test' });
      expect(app!.kind).toBe('mongo');
      expect(app!.store).toBeInstanceOf(MongoStore);
      expect((await fetch(`${base}/v1/boards/c1`)).status).toBe(200);
    } finally {
      const client = await MongoClient.connect(process.env.HK_TEST_MONGO_URL!);
      await client.db(db).dropDatabase();
      await client.close();
    }
  });
});
