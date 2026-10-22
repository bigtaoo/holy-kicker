import { X509Certificate, verify, type KeyObject } from 'node:crypto';
import type { Game, GcIdentity } from './protocol';

// Checking Game Center's identity signature (docs/cloud-save.md "iOS: Game Center"): the iOS
// shell asks GameKit to sign the player (GKLocalPlayer.fetchItems(forIdentityVerificationSignature:))
// and the server checks it against Apple's public key before it hands out that player's slot.
// Only a phone signed in to Game Center makes a real signature, so the tests use a key of their own.

/** The two apps' bundle ids (client/src/platform/ios/apps.json) and the game each one is. */
export const GC_APPS: Record<string, Game> = { 'com.gamestao.holykicker': 'monk', 'com.gamestao.corgi': 'corgi' };
/** A signature's timestamp may be this far from now (ms). */
export const GC_MAX_AGE_MS = 3600_000;
/** Where Apple keeps the keys; the URL comes from the client, so nothing else is fetched. */
const KEY_HOST = 'static.gc.apple.com';
const KEY_KEEP_MS = 24 * 3600_000;

/** The signed bytes: the player id, the bundle id (UTF-8), the timestamp (big-endian, 64 bits), the salt. */
export function gcPayload(player: string, bundle: string, ts: number, salt: Buffer): Buffer {
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(ts));
  return Buffer.concat([Buffer.from(player, 'utf8'), Buffer.from(bundle, 'utf8'), time, salt]);
}

export function keyUrlOk(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === KEY_HOST && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

/** Apple's public key at `url`, or null when it is not Apple's, does not load or is out of date. */
export type KeyOf = (url: string) => Promise<KeyObject | null>;

/**
 * The player the identity proves for `game`, as `team:<id>` or `game:<id>` (whichever id the
 * signature is over), or null: a bundle that is not that game's app, a stale timestamp, a key
 * that is not Apple's, a signature that does not check.
 */
export async function verifiedPlayer(id: GcIdentity, game: Game, now: number, keyOf: KeyOf): Promise<string | null> {
  if (GC_APPS[id.bundle] !== game || Math.abs(now - id.ts) > GC_MAX_AGE_MS || !keyUrlOk(id.key)) return null;
  const key = await keyOf(id.key);
  if (!key) return null;
  const sig = Buffer.from(id.sig, 'base64');
  const salt = Buffer.from(id.salt, 'base64');
  const ids: [string, string | undefined][] = [['team', id.player], ['game', id.alt]];
  for (const [kind, player] of ids) {
    if (player && verify('sha256', gcPayload(player, id.bundle, id.ts, salt), key, sig)) return `${kind}:${player}`;
  }
  return null;
}

/** Apple's keys, fetched over HTTPS from static.gc.apple.com and kept a day. */
export function appleKeys(get: typeof fetch = fetch, now: () => number = Date.now): KeyOf {
  const kept = new Map<string, { key: KeyObject; until: number }>();
  return async (url) => {
    if (!keyUrlOk(url)) return null;
    const k = kept.get(url);
    if (k && k.until > now()) return k.key;
    try {
      const res = await get(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const cert = new X509Certificate(Buffer.from(await res.arrayBuffer()));
      const t = now();
      if (Date.parse(cert.validFrom) > t || Date.parse(cert.validTo) < t) return null;
      if (kept.size > 20) kept.clear();
      kept.set(url, { key: cert.publicKey, until: Math.min(t + KEY_KEEP_MS, Date.parse(cert.validTo)) });
      return cert.publicKey;
    } catch {
      return null;
    }
  };
}
