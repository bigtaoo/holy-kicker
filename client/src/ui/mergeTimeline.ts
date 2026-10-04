// The merge effect's timing (docs/design.md "Merge screen and effect"), pure so it is tested
// without Pixi: the copies fly into the centre one after another, each landing with a pop and
// a shake; the centre charges in the new tier's colour; a white flash and a burst; the new
// item drops in with a squash-and-stretch bounce; the stat card slides up and counts. `fast`
// is "Merge all"'s short version (flight and charge sped up). Times in seconds.

export const COPIES = 5;

export interface MergeTiming {
  /** Gap between two copies setting off, and one copy's flight. */
  stagger: number;
  flight: number;
  charge: number;
  flash: number;
  drop: number;
  card: number;
  /** Seconds the card's numbers count up. */
  count: number;
}

const FULL: MergeTiming = { stagger: 0.14, flight: 0.28, charge: 0.6, flash: 0.18, drop: 0.55, card: 0.3, count: 0.5 };
const FAST: MergeTiming = { ...FULL, stagger: 0.05, flight: 0.16, charge: 0.25 };

export function mergeTiming(fast: boolean): MergeTiming {
  return fast ? FAST : FULL;
}

/** When the last copy lands, the charge ends (the flash), the drop ends and the card is up. */
export function marks(m: MergeTiming): { landed: number; burst: number; dropped: number; carded: number; counted: number } {
  const landed = m.stagger * (COPIES - 1) + m.flight;
  const burst = landed + m.charge;
  const dropped = burst + m.drop;
  const carded = dropped + m.card;
  return { landed, burst, dropped, carded, counted: carded + m.count };
}

export interface MergeFrame {
  /** Per copy: 0 waiting on the rim .. 1 in the centre; null once it has landed. */
  copies: (number | null)[];
  /** 0..1 charge of the ring, 0 outside the charge. */
  charge: number;
  /** White flash opacity. */
  flash: number;
  /** The new item: hidden before the burst, then how far it has fallen in (1 landed) and its scale x and y (squash and stretch). */
  item: { fall: number; sx: number; sy: number } | null;
  /** 0..1 the card has slid up; 0..1 its numbers have counted. */
  card: number;
  count: number;
}

const easeIn = (k: number) => k * k;
const clamp = (k: number) => Math.max(0, Math.min(1, k));

export function mergeFrame(t: number, m: MergeTiming): MergeFrame {
  const mk = marks(m);
  const copies: (number | null)[] = [];
  for (let i = 0; i < COPIES; i++) {
    const k = (t - i * m.stagger) / m.flight;
    copies.push(k >= 1 ? null : easeIn(clamp(k)));
  }
  const charge = t >= mk.landed && t < mk.burst ? (t - mk.landed) / m.charge : 0;
  const flash = t >= mk.burst ? Math.max(0, 1 - (t - mk.burst) / m.flash) : 0;
  let item: MergeFrame['item'] = null;
  if (t >= mk.burst) {
    const k = clamp((t - mk.burst) / m.drop);
    // falls in from above stretched, squashes on landing, settles with a small overshoot
    const squash = Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.35;
    item = { fall: easeIn(clamp(k / 0.3)), sx: 1 + squash, sy: 1 - squash };
  }
  return {
    copies, charge, flash, item,
    card: clamp((t - mk.dropped) / m.card),
    count: clamp((t - mk.carded) / m.count),
  };
}

/** Where a tap jumps: before the card is up, straight to the counted card; then it closes. */
export function skipTo(t: number, m: MergeTiming): number | 'close' {
  const mk = marks(m);
  return t < mk.counted ? mk.counted : 'close';
}
