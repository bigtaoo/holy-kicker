// Writing a save back without losing what this build could not read (docs/cloud-save.md "Older
// builds"). A save can come from a newer build: an iOS hot update rolled back, a portal still on
// an older upload, a portal's cloud copy written by a newer one. parseSave reads it in this
// build's terms (twenty chapters, the items it knows, bit fields cut to its width), and writing
// that back as it is would drop the rest for good. So the stored object is kept, and each value
// this build did not change goes back exactly as it was stored; a changed value goes back as
// changed, with the stored array's tail past this build's length, the stored object's unknown
// keys and, in a bit field, the stored bits this build did not know.

/** Bit fields, and arrays of them: a change keeps the stored bits this build cut off. */
const BITS = new Set(['monks', 'achieved', 'seen', 'chests', 'opened', 'hardChests', 'hardOpened', 'claimed']);
/** Lists with no positions: the codex is a set (unknown evolutions stay), the weeks are this build's. */
const SETS = new Set(['codex']);
const OWN = new Set(['weeks']);
/**
 * Counts per item and tier: an item's counts go back together, since a stored count this build
 * read differently (a relic's copy granted on load) would undo a merge or a drop beside it.
 */
const COUNTS = new Set(['gear']);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isMask = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && same(a[k], b[k]));
  }
  return false;
}

/**
 * The value to store for `data`, which this build read as `seen` from the stored `raw`.
 * `key` names the field, for the bit fields and the lists without positions.
 */
export function keep(data: unknown, seen: unknown, raw: unknown, key = ''): unknown {
  if (raw === undefined) return data;
  if (same(data, seen)) return raw;
  if (SETS.has(key) && Array.isArray(data)) {
    return Array.isArray(raw) ? [...data, ...raw.filter((v) => !data.some((d) => same(d, v)))] : data;
  }
  if (OWN.has(key)) return data;
  if (Array.isArray(data)) {
    const r = Array.isArray(raw) ? raw : [];
    const s = Array.isArray(seen) ? seen : [];
    const out = COUNTS.has(key) ? data : data.map((v, i) => keep(v, s[i], r[i], key));
    return r.length > out.length ? [...out, ...r.slice(out.length)] : out;
  }
  if (isObj(data)) {
    if (!isObj(raw)) return data;
    const s = isObj(seen) ? seen : {};
    const out: Obj = { ...raw };
    for (const [k, v] of Object.entries(data)) out[k] = keep(v, s[k], raw[k], COUNTS.has(key) ? key : k);
    return out;
  }
  // a word of a bit field this build did not read at all (achieved) counts as none seen
  if (BITS.has(key) && isMask(data) && (seen === undefined || isMask(seen)) && isMask(raw)) {
    return Number(BigInt(data) | (BigInt(raw) & ~BigInt(seen ?? 0)));
  }
  return data;
}
