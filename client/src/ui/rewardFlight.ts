import { ITEM_IDS, type Inventory, type ItemId } from '../meta/gear';

// What a claim in the lobby looks like (rewardFlightView.ts draws it): the coins, gems and gear
// it paid burst out of where the player tapped and fly to the top bar's counters (the gear to the
// Gear tab), and each counter ticks up as its pieces land. Pure: the pieces, where one is at a
// given age and what a counter shows then, so the timing is tested without Pixi.

export type PieceKind = 'copper' | 'jade' | 'gear';

export interface Wallet {
  copper: number;
  jade: number;
  gear: Inventory;
}

/** What a change paid in: the currencies that went up, and one item id per piece of gear that came in. */
export interface Gain {
  copper: number;
  jade: number;
  items: ItemId[];
}

/** At most this many coins (or gems) fly for one currency, however much was paid, and this many gear pieces. */
export const MAX_COINS = 6;
export const MAX_GEAR = 4;
/** Seconds: between two pieces setting off, the burst out, and the flight in. */
export const STAGGER = 0.06;
export const BURST = 0.2;
export const FLIGHT = 0.55;
/** Seconds a counter swells for after a piece lands, and by how much at most. */
export const BUMP = 0.16;
export const BUMP_SCALE = 0.28;

function count(inv: Inventory, id: ItemId): number {
  return (inv[id] ?? []).reduce((a, b) => a + b, 0);
}

/**
 * What `after` holds beyond `before`, or null for nothing (a spend, a merge, a name). Gear counts
 * only when the total grew, so a merge (two in, one out) or a sale flies nothing.
 */
export function gainOf(before: Wallet, after: Wallet): Gain | null {
  const copper = Math.max(0, after.copper - before.copper);
  const jade = Math.max(0, after.jade - before.jade);
  const items: ItemId[] = [];
  let total = 0;
  for (const id of ITEM_IDS) {
    const d = count(after.gear, id) - count(before.gear, id);
    total += d;
    for (let i = 0; i < d; i++) items.push(id);
  }
  if (total <= 0) items.length = 0;
  return copper > 0 || jade > 0 || items.length > 0 ? { copper, jade, items } : null;
}

export interface Piece {
  kind: PieceKind;
  /** The coin's id in the icon sheet, or the item's. */
  icon: string;
  /** Seconds after the start it sets off. */
  delay: number;
  /** Where the burst throws it, from the tap, UI units. */
  out: { x: number; y: number };
}

/** The pieces for a gain: a few coins per currency (more for more), then the gear, staggered. */
export function piecesOf(gain: Gain): Piece[] {
  const coins = (n: number) => (n <= 0 ? 0 : Math.min(MAX_COINS, 2 + Math.floor(Math.log10(n + 1) * 1.5)));
  const list: { kind: PieceKind; icon: string }[] = [];
  for (let i = 0; i < coins(gain.copper); i++) list.push({ kind: 'copper', icon: 'copper' });
  for (let i = 0; i < coins(gain.jade); i++) list.push({ kind: 'jade', icon: 'jade' });
  for (const id of gain.items.slice(0, MAX_GEAR)) list.push({ kind: 'gear', icon: id });
  // a fan round the tap, each piece a golden angle on from the last so they never stack
  return list.map((p, i) => {
    const a = i * 2.39996 - Math.PI / 2;
    const r = 110 + (i % 3) * 40;
    return { ...p, delay: i * STAGGER, out: { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) } };
  });
}

/** When piece `p` lands. */
export const landsAt = (p: Piece) => p.delay + BURST + FLIGHT;

/** The whole flight's length. */
export const flightLength = (pieces: readonly Piece[]) => pieces.reduce((m, p) => Math.max(m, landsAt(p)), 0);

export interface Pose {
  x: number;
  y: number;
  scale: number;
  alpha: number;
}

/**
 * Where piece `p` is at `age` seconds, thrown out of `from` and flown to `to`: null before it sets
 * off and once it has landed. The burst eases out; the flight eases in along an arc that lifts first.
 */
export function poseAt(p: Piece, age: number, from: { x: number; y: number }, to: { x: number; y: number }): Pose | null {
  const t = age - p.delay;
  if (t < 0 || t >= BURST + FLIGHT) return null;
  const burst = { x: from.x + p.out.x, y: from.y + p.out.y };
  if (t < BURST) {
    const k = t / BURST;
    const e = 1 - (1 - k) * (1 - k);
    return { x: from.x + p.out.x * e, y: from.y + p.out.y * e, scale: 0.5 + 0.6 * e, alpha: Math.min(1, k * 3) };
  }
  const k = (t - BURST) / FLIGHT;
  const e = k * k;
  // a quadratic arc whose control point sits over the burst, towards the target's height
  const c = { x: burst.x, y: Math.min(burst.y, to.y) - 120 };
  const u = 1 - e;
  return {
    x: u * u * burst.x + 2 * u * e * c.x + e * e * to.x,
    y: u * u * burst.y + 2 * u * e * c.y + e * e * to.y,
    scale: 1.1 - 0.45 * e,
    alpha: 1,
  };
}

/** What a counter of `kind` shows at `age`: the amount before the gain, rising by a share as each of its pieces lands. */
export function shownAt(kind: 'copper' | 'jade', final: number, gain: Gain, pieces: readonly Piece[], age: number): number {
  const mine = pieces.filter((p) => p.kind === kind);
  if (mine.length === 0) return final;
  const landed = mine.filter((p) => age >= landsAt(p)).length;
  return final - Math.round(gain[kind] * (mine.length - landed) / mine.length);
}

/** How much bigger a counter of `kind` is drawn at `age`: it swells as each piece lands and settles back. */
export function bumpAt(kind: PieceKind, pieces: readonly Piece[], age: number): number {
  let best = 0;
  for (const p of pieces) {
    if (p.kind !== kind) continue;
    const since = age - landsAt(p);
    if (since >= 0 && since < BUMP) best = Math.max(best, 1 - since / BUMP);
  }
  return 1 + BUMP_SCALE * best;
}
