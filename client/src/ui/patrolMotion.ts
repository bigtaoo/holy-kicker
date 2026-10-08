// The patrol scene's motion, kept pure (no Pixi): the monk walks while time piles up and stops
// to rest once the patrol is full, the hills scroll behind him at a fraction of his pace, and
// the roadside props sit at fixed places along a loop of road.

/** Logical units per second the road moves under a walking monk. */
export const WALK_SPEED = 230;
/** The far hills move at this share of the road's pace. */
export const FAR_SHARE = 0.15;
/** Seconds the pace takes to ease to a stop (or back up to a walk). */
export const EASE = 0.6;

export type PatrolPose = 'walk' | 'rest';

/** Walking while the patrol still pays, resting once it is full. */
export function patrolPose(hours: number, capHours: number): PatrolPose {
  return hours >= capHours ? 'rest' : 'walk';
}

/** Eases the pace (0..1, a share of WALK_SPEED) toward 1 walking or 0 resting. */
export function stepPace(pace: number, pose: PatrolPose, dt: number): number {
  const target = pose === 'walk' ? 1 : 0;
  const step = dt / EASE;
  return pace < target ? Math.min(target, pace + step) : Math.max(target, pace - step);
}

/** `x` wrapped into [0, period). */
export function wrap(x: number, period: number): number {
  return ((x % period) + period) % period;
}

export interface RoadProp {
  kind: string;
  /** Where along the loop of road it stands. */
  x: number;
  /** Its height as a share of the scene's prop height. */
  scale: number;
  /** Drawn mirrored. */
  flip: boolean;
}

/** A tiny seeded generator, so the road looks the same every time the panel opens. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** No two neighbours on the loop (the last one included, which stands next to the first) alike. */
export function noTwins(props: readonly RoadProp[]): boolean {
  if (props.length < 2) return true;
  return props.every((p, i) => p.kind !== props[(i + 1) % props.length].kind);
}

/**
 * Props along a loop of road `length` long: one every `gap` on average, kinds taken in turn
 * from a shuffled list so two of a kind never stand side by side, not even where the loop
 * closes.
 */
export function roadProps(kinds: readonly string[], length: number, gap: number, seed = 7): RoadProp[] {
  if (kinds.length === 0) return [];
  const rnd = lcg(seed);
  const n = Math.max(1, Math.round(length / gap));
  const order = [...kinds];
  const out: RoadProp[] = [];
  for (let i = 0; i < n; i++) {
    if (i % order.length === 0) {
      for (let j = order.length - 1; j > 0; j--) {
        const k = Math.floor(rnd() * (j + 1));
        [order[j], order[k]] = [order[k], order[j]];
      }
      // a new round never starts with the kind the last one ended on
      if (out.length && order[0] === out[out.length - 1].kind && order.length > 1) [order[0], order[1]] = [order[1], order[0]];
    }
    out.push({
      kind: order[i % order.length],
      x: (i + 0.2 + rnd() * 0.6) * (length / n),
      scale: 0.7 + rnd() * 0.3,
      flip: rnd() < 0.5,
    });
  }
  // the last round may end on the kind the road starts with: trade the last kind with an
  // earlier one that leaves no twins
  for (let j = n - 2; j > 0 && !noTwins(out); j--) {
    [out[n - 1].kind, out[j].kind] = [out[j].kind, out[n - 1].kind];
    if (!noTwins(out)) [out[n - 1].kind, out[j].kind] = [out[j].kind, out[n - 1].kind];
  }
  return out;
}

/**
 * Where a prop standing at `x` on the loop is on screen once the monk has walked `travel`:
 * it walks off `margin` past the left edge and comes back at the far end of the loop.
 */
export function propX(x: number, travel: number, length: number, margin: number): number {
  return wrap(x - travel + margin, length) - margin;
}

/** The loot sack's size as a share of its full size: it fills up with the hours. */
export function sackScale(hours: number, capHours: number): number {
  return 0.7 + 0.45 * Math.min(1, Math.max(0, hours / capHours));
}

/** Seconds between two coins the walking monk finds on the road. */
export const COIN_EVERY = 2.2;
/** Seconds a coin (or a gear drop) takes to fly into the sack. */
export const FLY_TIME = 0.7;

/**
 * The coin clock after `dt`: a coin every COIN_EVERY seconds at a full walk, none while he
 * slows down or rests, and never more than one a step (a long frame does not pour coins).
 */
export function coinStep(clock: number, dt: number, pace: number): { clock: number; coin: boolean } {
  if (pace <= 0.9) return { clock, coin: false };
  const next = clock + dt;
  return next >= COIN_EVERY ? { clock: (next - COIN_EVERY) % COIN_EVERY, coin: true } : { clock: next, coin: false };
}

/** A gear drop flies in when one is found while the panel is up; `seen` is -1 before the first look. */
export function dropFlies(seen: number, drops: number): boolean {
  return seen >= 0 && drops > seen;
}

/** The sack's size `dt` later, settling from a bounce back to its resting size. */
export function settle(size: number, rest: number, dt: number): number {
  return size + (rest - size) * Math.min(1, dt * 8);
}

/** A point on the arc from `a` to `b` at share `k` (0..1), bulging up by `lift`. */
export function arc(a: { x: number; y: number }, b: { x: number; y: number }, k: number, lift: number): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - 4 * lift * k * (1 - k) };
}
