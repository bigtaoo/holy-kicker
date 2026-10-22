import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newCode } from './cloudSave';
import { MemoryVault } from './cloudVault';
import { GC_APPS, GC_MAX_AGE_MS, gcPayload, keyUrlOk, verifiedPlayer } from './gameCenter';
import { CLOUD_LIMITS, checkCloudWrite, readCode, showCode, type GcIdentity } from './protocol';
import { route, type Deps, type Req } from './routes';
import { MemoryStore } from './store';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const KEY_URL = 'https://static.gc.apple.com/public-key/gc-prod-10.cer';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function deps(over: Partial<Deps> = {}): Deps & { cloud: { vault: MemoryVault } } {
  const vault = new MemoryVault();
  const cloud = { vault, gcKey: async (url: string) => (url === KEY_URL ? publicKey : null) };
  return { store: new MemoryStore(), tagSalt: 'salt', adminKey: 'key', now: () => NOW, allow: () => true, resim: { push() {} }, cloud, ...over } as Deps & { cloud: { vault: MemoryVault } };
}

const post = (path: string, body: unknown): Req => ({ method: 'POST', path, query: new URLSearchParams(), headers: {}, body, ip: '1.2.3.4' });
const save = (version: number, runs = 1) => JSON.stringify({ version, runs, future: { kept: true } });

/** An identity Game Center would make, signed by the test's key over `signed` (teamPlayerID unless told). */
function identity(over: Partial<GcIdentity> = {}, signed?: string): GcIdentity {
  const id: GcIdentity = { player: 'T:team1', alt: 'G:game1', bundle: 'com.gamestao.holykicker', key: KEY_URL, sig: '', salt: Buffer.from('salty').toString('base64'), ts: NOW - 1000, ...over };
  const bytes = gcPayload(signed ?? id.player, id.bundle, id.ts, Buffer.from(id.salt, 'base64'));
  return { ...id, sig: sign('sha256', bytes, privateKey).toString('base64'), ...(over.sig !== undefined && { sig: over.sig }) };
}

describe('restore codes', () => {
  it('read back however they are typed', () => {
    const code = newCode();
    expect(code).toHaveLength(CLOUD_LIMITS.code);
    expect(readCode(showCode(code).toLowerCase())).toBe(code);
    expect(readCode('abcd efgh jkmn')).toBe('ABCDEFGHJKMN');
    expect(readCode('O1IL-0000-0000')).toBe('0111' + '0'.repeat(8));
    expect(readCode('ABCD-EFGH-JKMU')).toBeNull();
    expect(readCode('ABCD')).toBeNull();
  });

  it('use every letter of the alphabet', () => {
    expect(newCode(() => Buffer.from([0, 31, 32, 63, 255, 10, 11, 12, 13, 14, 15, 16]))).toBe('0Z0ZZABCDEFG');
  });
});

describe('cloud slots', () => {
  it('back up, read and write over a revision', async () => {
    const d = deps();
    const made = await route(post('/v1/cloud/new', { game: 'monk' }), d);
    expect(made.status).toBe(200);
    const { code } = made.body as { code: string };
    expect(await route(post('/v1/cloud/read', { game: 'monk', code: showCode(code) }), d)).toEqual({ status: 200, body: { rev: 0, save: null } });
    expect(await route(post('/v1/cloud/write', { game: 'monk', code, base: 0, save: save(10) }), d)).toEqual({ status: 200, body: { rev: 1 } });
    // a write over an old revision gets the slot back to merge
    expect(await route(post('/v1/cloud/write', { game: 'monk', code, base: 0, save: save(10, 2) }), d)).toEqual({ status: 409, body: { rev: 1, save: save(10) } });
    // and an older build's save never goes over a newer one
    expect((await route(post('/v1/cloud/write', { game: 'monk', code, base: 1, save: save(9) }), d)).status).toBe(409);
    expect(await route(post('/v1/cloud/write', { game: 'monk', code, base: 1, save: save(11, 3) }), d)).toEqual({ status: 200, body: { rev: 2 } });
  });

  it('keep each game to its own slots', async () => {
    const d = deps();
    const { code } = (await route(post('/v1/cloud/new', { game: 'corgi' }), d)).body as { code: string };
    expect((await route(post('/v1/cloud/read', { game: 'monk', code }), d)).status).toBe(404);
    expect((await route(post('/v1/cloud/write', { game: 'monk', code, base: 0, save: save(10) }), d)).status).toBe(404);
    expect((await route(post('/v1/cloud/read', { game: 'corgi', code }), d)).status).toBe(200);
  });

  it('refuse what is no save, an unknown code, a GET and too many tries', async () => {
    const d = deps();
    const { code } = (await route(post('/v1/cloud/new', { game: 'monk' }), d)).body as { code: string };
    expect((await route(post('/v1/cloud/write', { game: 'monk', code, base: 0, save: '[1]' }), d)).status).toBe(400);
    expect((await route(post('/v1/cloud/write', { game: 'monk', code, base: 0, save: save(10) + ' '.repeat(CLOUD_LIMITS.saveBytes) }), d)).status).toBe(400);
    expect(checkCloudWrite({ game: 'monk', code, base: -1, save: save(10) }).ok).toBe(false);
    expect((await route(post('/v1/cloud/read', { game: 'monk', code: 'ZZZZZZZZZZZZ' }), d)).status).toBe(404);
    expect((await route({ ...post('/v1/cloud/read', {}), method: 'GET' }, d)).status).toBe(404);
    expect((await route(post('/v1/cloud/new', { game: 'monk' }), deps({ allow: (r) => r !== 'cloudNew' }))).status).toBe(429);
    expect((await route(post('/v1/cloud/read', { game: 'monk', code }), deps({ allow: (r) => r !== 'cloud' }))).status).toBe(429);
    expect((await route(post('/v1/cloud/new', { game: 'monk' }), deps({ cloud: undefined }))).status).toBe(404);
  });
});

describe('Game Center', () => {
  it('finds the slot a signed player backed up, and only theirs', async () => {
    const d = deps();
    expect((await route(post('/v1/cloud/gc', { game: 'monk', identity: identity(), create: false }), d)).status).toBe(404);
    const made = await route(post('/v1/cloud/gc', { game: 'monk', identity: identity(), create: true }), d);
    expect(made.status).toBe(200);
    expect(await route(post('/v1/cloud/gc', { game: 'monk', identity: identity({ ts: NOW - 5000 }), create: false }), d)).toEqual(made);
    // no Game Center id is stored
    expect(JSON.stringify([...d.cloud.vault.slots.values()])).not.toContain('team1');
    // the corgi's app has its own slot for the same player
    const corgi = await route(post('/v1/cloud/gc', { game: 'corgi', identity: identity({ bundle: 'com.gamestao.corgi' }), create: true }), d);
    expect((corgi.body as { code: string }).code).not.toBe((made.body as { code: string }).code);
  });

  it('takes a signature over gamePlayerID too', async () => {
    expect(await verifiedPlayer(identity({}, 'G:game1'), 'monk', NOW, async () => publicKey)).toBe('game:G:game1');
    expect(await verifiedPlayer(identity(), 'monk', NOW, async () => publicKey)).toBe('team:T:team1');
  });

  it('refuses a forged, stale or foreign identity', async () => {
    const d = deps();
    const gc = (id: GcIdentity, game = 'monk') => route(post('/v1/cloud/gc', { game, identity: id, create: true }), d);
    expect((await gc({ ...identity(), player: 'T:someone' }, 'monk')).status).toBe(403);
    expect((await gc(identity({ ts: NOW - GC_MAX_AGE_MS - 1 }))).status).toBe(403);
    expect((await gc(identity({ bundle: 'com.example.other' }))).status).toBe(403);
    expect((await gc(identity(), 'corgi')).status).toBe(403);
    expect((await gc(identity({ key: 'https://evil.example/key.cer' }))).status).toBe(403);
    expect((await gc(identity({ sig: Buffer.from('nope').toString('base64') }))).status).toBe(403);
    expect(d.cloud.vault.slots.size).toBe(0);
  });

  it('fetches keys only from Apple', () => {
    expect(keyUrlOk(KEY_URL)).toBe(true);
    expect(keyUrlOk('http://static.gc.apple.com/k.cer')).toBe(false);
    expect(keyUrlOk('https://static.gc.apple.com.evil.example/k.cer')).toBe(false);
    expect(keyUrlOk('https://x@static.gc.apple.com/k.cer')).toBe(false);
    expect(keyUrlOk('https://static.gc.apple.com:8443/k.cer')).toBe(false);
  });

  it('knows both apps by their bundle ids', () => {
    const apps = JSON.parse(readFileSync(new URL('../../client/src/platform/ios/apps.json', import.meta.url), 'utf8')) as Record<string, { bundleId: string }>;
    for (const [game, a] of Object.entries(apps)) expect(GC_APPS[a.bundleId]).toBe(game);
    expect(Object.keys(GC_APPS)).toHaveLength(2);
  });
});
