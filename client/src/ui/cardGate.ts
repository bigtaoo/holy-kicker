// The entrance of the level-up and shrine cards (cardPanel.ts). The cards rise into place one
// after another and stay grey and deaf to taps for CARD_LOCK seconds while a gold line runs round
// each rim; when it closes they light up with a small pop. A thumb that was steering the hero
// when the panel opened cannot pick a card it never saw. Pure, so it is tested without Pixi.

/** Seconds the cards ignore taps after the panel opens. */
export const CARD_LOCK = 0.6;
/** How far below its place a card starts, and how long it takes to rise, seconds. */
export const CARD_RISE_Y = 90;
const RISE = 0.22;
/** Each card starts this much later than the one above it. */
const STAGGER = 0.07;
/** The pop when the cards light up, and the rim's fade after it, seconds. */
const POP = 0.16;

export interface CardPose {
  /** Offset below the card's place. */
  y: number;
  alpha: number;
  /** Still locked: drawn grey, taps ignored. */
  locked: boolean;
  /** How much of the gold rim is drawn, 0..1, and its opacity. */
  rim: number;
  rimAlpha: number;
  scale: number;
}

/** Card `index` (from the top) `age` seconds after the panel opened. */
export function cardPose(age: number, index: number): CardPose {
  const k = Math.max(0, Math.min(1, (age - index * STAGGER) / RISE));
  const ease = 1 - (1 - k) * (1 - k) * (1 - k);
  const locked = age < CARD_LOCK;
  const after = age - CARD_LOCK;
  const pop = !locked && after < POP ? Math.sin((Math.PI * after) / POP) : 0;
  return {
    y: CARD_RISE_Y * (1 - ease),
    alpha: k,
    locked,
    rim: Math.min(1, Math.max(0, age) / CARD_LOCK),
    rimAlpha: locked ? 1 : Math.max(0, 1 - after / POP),
    scale: 1 + 0.04 * pop,
  };
}

/** The entrance is over: nothing changes any more. */
export function cardsSettled(age: number): boolean {
  return age >= CARD_LOCK + POP;
}

/**
 * The first `share` of the outline of a w x h box with corner radius r centred on the origin,
 * clockwise from the middle of its top edge, as flat [x, y, x, y, ...] points.
 */
export function rimPoints(w: number, h: number, r: number, share: number): number[] {
  const full = outline(w, h, r);
  const lengths = [0];
  for (let i = 2; i < full.length; i += 2) {
    lengths.push(lengths[lengths.length - 1] + Math.hypot(full[i] - full[i - 2], full[i + 1] - full[i - 1]));
  }
  const want = lengths[lengths.length - 1] * Math.max(0, Math.min(1, share));
  const out = [full[0], full[1]];
  for (let j = 1; j < lengths.length; j++) {
    if (lengths[j] <= want) {
      out.push(full[2 * j], full[2 * j + 1]);
      continue;
    }
    const f = (want - lengths[j - 1]) / (lengths[j] - lengths[j - 1]);
    if (f > 0) out.push(full[2 * j - 2] + (full[2 * j] - full[2 * j - 2]) * f, full[2 * j - 1] + (full[2 * j + 1] - full[2 * j - 1]) * f);
    break;
  }
  return out;
}

/** The whole closed outline, with each rounded corner as a few straight steps. */
function outline(w: number, h: number, r: number): number[] {
  const x = w / 2 - r;
  const y = h / 2 - r;
  const steps = 6;
  const pts = [0, -h / 2];
  // corner centres clockwise from the top right, each arc starting at its angle
  const corners: [number, number, number][] = [[x, -y, -Math.PI / 2], [x, y, 0], [-x, y, Math.PI / 2], [-x, -y, Math.PI]];
  for (const [cx, cy, a0] of corners) {
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (Math.PI / 2) * (s / steps);
      pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  }
  pts.push(0, -h / 2);
  return pts;
}
