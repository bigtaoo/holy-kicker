import { isGame, type Game } from './game';

// The cloud save's wire format (docs/cloud-save.md "The cloud save"): a slot on the backend
// holding one player's save, reached by its restore code. Re-exported by protocol.ts, so the
// client reads it as `@hk/protocol`. Pure, like the rest of the protocol.

export const CLOUD_LIMITS = {
  /** The longest save a slot takes, as text (a 20-chapter save is about 3 kB). */
  saveBytes: 24 * 1024,
  /** Characters in a restore code. */
  code: 12,
  /** Game Center identity fields: ids, a bundle id, base-64 signature and salt, the key's URL. */
  gcField: 512,
  /** A slot not written for this many days is dropped (the privacy policy states it). */
  slotDays: 30,
};

/** Crockford's base 32: no I, L, O or U, so a code read aloud or copied by hand survives. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A restore code as the player typed it (any case, dashes and spaces, O for 0, I or L for 1), or null. */
export function readCode(text: string): string | null {
  const s = text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return s.length === CLOUD_LIMITS.code && [...s].every((c) => CODE_ALPHABET.includes(c)) ? s : null;
}

/** A code as shown: in groups of four, `ABCD-EFGH-JKMN`. */
export function showCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** What Game Center's identity signature hands the shell (GKLocalPlayer.fetchItems(forIdentityVerificationSignature:)). */
export interface GcIdentity {
  /** teamPlayerID, the id Apple documents as signed; `alt` is gamePlayerID, tried after it. */
  player: string;
  alt?: string;
  bundle: string;
  /** The URL of Apple's public key certificate. */
  key: string;
  /** Base 64. */
  sig: string;
  salt: string;
  /** ms since the epoch, as Game Center gave it. */
  ts: number;
}

export interface CloudNew {
  game: Game;
}

export interface CloudGc {
  game: Game;
  identity: GcIdentity;
  /** Make a slot for this player when there is none (Back up), or only find one (Restore). */
  create: boolean;
}

/** A slot is one game's: a code of the other game's is no slot here. */
export interface CloudRead {
  game: Game;
  code: string;
}

export interface CloudWrite {
  game: Game;
  code: string;
  /** The slot's revision the save was merged from. */
  base: number;
  save: string;
}

/** The answer to new and gc. */
export interface CloudSlot {
  code: string;
  rev: number;
}

/** The answer to read, and to a write that came too late (409): the slot as it is. */
export interface CloudCopy {
  rev: number;
  /** null while the slot is empty. */
  save: string | null;
}

type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const field = (v: unknown, max = CLOUD_LIMITS.gcField): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** The version a save's text says it is, or null when it is no JSON object with a whole version. */
export function saveVersion(save: string): number | null {
  try {
    const o: unknown = JSON.parse(save);
    return isObj(o) && typeof o.version === 'number' && Number.isSafeInteger(o.version) && o.version >= 0 ? o.version : null;
  } catch {
    return null;
  }
}

export function checkCloudNew(v: unknown): Checked<CloudNew> {
  return isObj(v) && isGame(v.game) ? { ok: true, value: { game: v.game } } : { ok: false, reason: 'bad game' };
}

export function checkCloudGc(v: unknown): Checked<CloudGc> {
  if (!isObj(v) || !isGame(v.game) || typeof v.create !== 'boolean') return { ok: false, reason: 'bad request' };
  const i = v.identity;
  if (!isObj(i) || !field(i.player) || !(i.alt === undefined || field(i.alt)) || !field(i.bundle) || !field(i.key) || !field(i.sig) || !field(i.salt)) return { ok: false, reason: 'bad identity' };
  if (typeof i.ts !== 'number' || !Number.isSafeInteger(i.ts) || i.ts < 0) return { ok: false, reason: 'bad identity' };
  const identity: GcIdentity = { player: i.player, bundle: i.bundle, key: i.key, sig: i.sig, salt: i.salt, ts: i.ts, ...(i.alt !== undefined && { alt: i.alt as string }) };
  return { ok: true, value: { game: v.game, identity, create: v.create } };
}

export function checkCloudRead(v: unknown): Checked<CloudRead> {
  const code = isObj(v) && typeof v.code === 'string' ? readCode(v.code) : null;
  if (!code || !isObj(v)) return { ok: false, reason: 'bad code' };
  return isGame(v.game) ? { ok: true, value: { game: v.game, code } } : { ok: false, reason: 'bad game' };
}

export function checkCloudWrite(v: unknown): Checked<CloudWrite> {
  const code = isObj(v) && typeof v.code === 'string' ? readCode(v.code) : null;
  if (!code || !isObj(v)) return { ok: false, reason: 'bad code' };
  if (!isGame(v.game)) return { ok: false, reason: 'bad game' };
  if (typeof v.base !== 'number' || !Number.isSafeInteger(v.base) || v.base < 0) return { ok: false, reason: 'bad base' };
  if (typeof v.save !== 'string' || v.save.length > CLOUD_LIMITS.saveBytes) return { ok: false, reason: 'bad save' };
  if (saveVersion(v.save) === null) return { ok: false, reason: 'bad save' };
  return { ok: true, value: { game: v.game, code, base: v.base, save: v.save } };
}
