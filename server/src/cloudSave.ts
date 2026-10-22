import { createHmac, randomBytes } from 'node:crypto';
import type { CloudVault } from './cloudVault';
import { verifiedPlayer, type KeyOf } from './gameCenter';
import { CLOUD_LIMITS, CODE_ALPHABET, checkCloudGc, checkCloudNew, checkCloudRead, checkCloudWrite, saveVersion, type CloudCopy, type CloudSlot, type Game } from './protocol';
import type { Deps, Reply, Req } from './routes';

// The cloud save's routes (docs/cloud-save.md "The server"), reached from routes.ts for every
// path under /v1/cloud/. A slot is reached by its restore code alone, so every call is a POST
// with the code in the body (never in a URL or a log) and rate limited per address.

export interface CloudDeps {
  vault: CloudVault;
  /** Apple's Game Center keys (gameCenter.ts appleKeys). */
  gcKey: KeyOf;
}

/** A new restore code: 12 characters of 5 random bits each. */
export function newCode(random: (n: number) => Buffer = randomBytes): string {
  return [...random(CLOUD_LIMITS.code)].map((b) => CODE_ALPHABET[b & 31]).join('');
}

const bad = (reason: string): Reply => ({ status: 400, body: { error: reason } });

/** A slot of its own for `gc` (a Game Center key) or none; a few tries past a taken code. */
async function makeSlot(vault: CloudVault, now: number, game: Game, gc: string | null): Promise<CloudSlot | null> {
  for (let i = 0; i < 4; i++) {
    const code = newCode();
    if (await vault.create(code, game, gc, now)) return { code, rev: 0 };
    // another call made this player's slot meanwhile
    const found = gc ? await vault.byGc(gc) : null;
    if (found) return { code: found, rev: (await vault.read(found))?.rev ?? 0 };
  }
  return null;
}

export async function cloudRoute(req: Req, d: Deps): Promise<Reply> {
  if (!d.cloud) return { status: 404 };
  const { vault } = d.cloud;
  if (req.method !== 'POST') return { status: 404 };

  if (req.path === '/v1/cloud/new') {
    if (!d.allow('cloudNew', req.ip)) return { status: 429 };
    const c = checkCloudNew(req.body);
    if (!c.ok) return bad(c.reason);
    const slot = await makeSlot(vault, d.now(), c.value.game, null);
    return slot ? { status: 200, body: slot } : { status: 503 };
  }

  if (req.path === '/v1/cloud/gc') {
    if (!d.allow('cloudNew', req.ip)) return { status: 429 };
    const c = checkCloudGc(req.body);
    if (!c.ok) return bad(c.reason);
    const { game, identity, create } = c.value;
    const player = await verifiedPlayer(identity, game, d.now(), d.cloud.gcKey);
    if (!player) return { status: 403 };
    // the database never holds the Game Center id, only this
    const gc = createHmac('sha256', d.tagSalt).update(`gc/${game}/${player}`).digest('base64url');
    const found = await vault.byGc(gc);
    if (found) return { status: 200, body: { code: found, rev: (await vault.read(found))?.rev ?? 0 } satisfies CloudSlot };
    if (!create) return { status: 404 };
    const slot = await makeSlot(vault, d.now(), game, gc);
    return slot ? { status: 200, body: slot } : { status: 503 };
  }

  if (req.path === '/v1/cloud/read') {
    if (!d.allow('cloud', req.ip)) return { status: 429 };
    const c = checkCloudRead(req.body);
    if (!c.ok) return bad(c.reason);
    const slot = await vault.read(c.value.code);
    if (!slot || slot.game !== c.value.game) return { status: 404 };
    return { status: 200, body: { rev: slot.rev, save: slot.save } satisfies CloudCopy };
  }

  if (req.path === '/v1/cloud/write') {
    if (!d.allow('cloud', req.ip)) return { status: 429 };
    const c = checkCloudWrite(req.body);
    if (!c.ok) return bad(c.reason);
    const { game, code, base, save } = c.value;
    const slot = await vault.read(code);
    if (!slot || slot.game !== game) return { status: 404 };
    const outcome = await vault.write(code, base, saveVersion(save) ?? 0, save, d.now());
    if (outcome === 'ok') return { status: 200, body: { rev: base + 1 } };
    if (outcome === 'none') return { status: 404 };
    const now = await vault.read(code);
    return { status: 409, body: { rev: now?.rev ?? 0, save: now?.save ?? null } satisfies CloudCopy };
  }

  return { status: 404 };
}
