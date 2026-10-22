import { actOf } from '@hk/engine';

// The lobby's drifting specks over the courtyard, one kind per act the player has reached
// (docs/unlocks.md): maple leaves, fireflies, snow and gold petals for the monk; motes, spores,
// ice and sparks for the corgi. Every speck's place is a pure function of its index and the
// clock, so nothing is kept per frame and the maths is tested without Pixi.

export interface DriftStyle {
  /** Specks on screen at once. */
  count: number;
  /** 1 falls, -1 rises. */
  dir: 1 | -1;
  /** UI units a second along `dir`, lowest and highest. */
  speed: [number, number];
  /** Side-to-side swing, UI units, and its period in seconds. */
  sway: number;
  swayPeriod: number;
  /** Size, UI units, lowest and highest. */
  size: [number, number];
  /** Turns a second at most (a leaf tumbles; a mote does not). */
  spin: number;
  colors: number[];
  /** How a speck is drawn: a tumbling leaf or petal, a soft dot of light, a snowflake. */
  shape: 'leaf' | 'mote' | 'flake';
}

export const LEAVES: DriftStyle = {
  count: 7, dir: 1, speed: [70, 120], sway: 60, swayPeriod: 3.2, size: [26, 40], spin: 0.5,
  colors: [0xe0702a, 0xf0a020, 0xc8452a], shape: 'leaf',
};

export const MOTES: DriftStyle = {
  count: 14, dir: -1, speed: [30, 60], sway: 24, swayPeriod: 4, size: [20, 32], spin: 0,
  colors: [0x6fd8e0, 0xa8e8f0, 0xffffff], shape: 'mote',
};

const FIREFLIES: DriftStyle = {
  count: 12, dir: -1, speed: [18, 40], sway: 70, swayPeriod: 5, size: [24, 34], spin: 0,
  colors: [0xd8f060, 0xf0f090, 0xb0e040], shape: 'mote',
};

const SNOW: DriftStyle = {
  count: 16, dir: 1, speed: [40, 80], sway: 40, swayPeriod: 4.5, size: [22, 36], spin: 0.15,
  colors: [0xffffff, 0xe8f4ff, 0xd0e6f8], shape: 'flake',
};

const PETALS: DriftStyle = {
  count: 10, dir: 1, speed: [60, 100], sway: 70, swayPeriod: 3.6, size: [24, 36], spin: 0.4,
  colors: [0xf6c640, 0xffe08a, 0xf2a0b0], shape: 'leaf',
};

const SPORES: DriftStyle = { ...FIREFLIES, colors: [0x8ef0a0, 0x60d890, 0xc8ffd0] };
const ICE: DriftStyle = { ...SNOW, colors: [0xffffff, 0xc8f0ff, 0x90d8f0] };
const SPARKS: DriftStyle = { ...MOTES, count: 16, colors: [0xffd060, 0xffe8a0, 0xf6a830] };

/** The specks for the act of the next chapter to play (`cleared` chapters behind the player): one look per act and theme. */
export function actDrift(corgi: boolean, cleared: number): DriftStyle {
  const looks = corgi ? [MOTES, SPORES, ICE, SPARKS] : [LEAVES, FIREFLIES, SNOW, PETALS];
  return looks[Math.min(looks.length, Math.max(1, actOf(cleared + 1))) - 1];
}

export interface Speck {
  x: number;
  y: number;
  rotation: number;
  size: number;
  color: number;
  /** Fades in at the start of its path and out at the end. */
  alpha: number;
}

/** A fixed pseudo-random share in [0, 1) for speck `i`'s trait `k`. */
export function share(i: number, k: number): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Speck `i` of `style` at `time` seconds, crossing a w x h box (top-left at 0, 0). */
export function speckAt(style: DriftStyle, i: number, time: number, w: number, h: number): Speck {
  const speed = style.speed[0] + (style.speed[1] - style.speed[0]) * share(i, 1);
  // a path is the box's height plus a margin either end, so specks enter and leave unseen
  const margin = style.size[1] * 2;
  const path = h + 2 * margin;
  const run = (time * speed + share(i, 2) * path) % path;
  const along = run - margin;
  const y = style.dir === 1 ? along : h - along;
  const phase = share(i, 3) * Math.PI * 2;
  const swing = Math.sin((time / style.swayPeriod) * Math.PI * 2 + phase);
  const x = share(i, 4) * w + swing * style.sway;
  const k = run / path;
  const edge = 0.12;
  const alpha = Math.min(1, k / edge, (1 - k) / edge);
  return {
    x,
    y,
    rotation: style.spin ? swing * 0.6 + time * style.spin * (share(i, 5) - 0.5) * Math.PI * 2 : 0,
    size: style.size[0] + (style.size[1] - style.size[0]) * share(i, 6),
    color: style.colors[Math.floor(share(i, 7) * style.colors.length)],
    alpha,
  };
}

/** The monk's idle breath as a squash: [scaleX, scaleY] around 1, tall on the in-breath. */
export function breath(time: number): [number, number] {
  const s = Math.sin(time * Math.PI * 2 / 2.4) * 0.015;
  return [1 - s, 1 + s];
}

/** The hop when the figure is tapped: height in UI units `time` seconds in, 0 once landed. */
export function hop(time: number, height = 40, length = 0.35): number {
  if (time < 0 || time >= length) return 0;
  const k = time / length;
  return 4 * height * k * (1 - k);
}
