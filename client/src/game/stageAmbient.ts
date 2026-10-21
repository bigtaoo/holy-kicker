// Each chapter's drifting air (docs/design.md "Ambient life"): leaves over the temple grass,
// fireflies over the marsh, snow on the pass, wisps in the ghost market, ash on Demon Peak; the
// corgi's planets have their own (frost, spores, sand, ash, hive spores).
// Specks live in world space, so they slide past as the hero runs, in a box round the camera
// that each one wraps across, fading near its edges so no wrap is ever seen. Every speck's place
// is a pure function of its index, the clock and the camera, so nothing is kept per frame.

import { THEME } from '../theme';
import { wrapNear } from './camera';

export type AmbientShape = 'leaf' | 'dot' | 'glow' | 'flake';

export interface AmbientStyle {
  shape: AmbientShape;
  /** Specks in the box on a quiet screen. */
  count: number;
  /** Drift, world units a second, and how much each speck's speed varies (0..1). */
  vx: number;
  vy: number;
  spread: number;
  /** Wander off the drift line, world units, and its period in seconds. */
  wander: number;
  period: number;
  /** Size, world units, lowest and highest. */
  size: [number, number];
  /** Turns a second at most; 0 for round specks. */
  spin: number;
  /** Blinks a second; 0 for a steady speck. */
  twinkle: number;
  alpha: number;
  colors: number[];
}

/** The monk's chapters, 1 to 5. */
export const MONK_AMBIENT: readonly AmbientStyle[] = [
  { shape: 'leaf', count: 12, vx: 45, vy: 60, spread: 0.4, wander: 50, period: 3.2, size: [30, 44], spin: 0.5, twinkle: 0, alpha: 0.9,
    colors: [0xc8b84a, 0x9cb850, 0xe0a040] },
  { shape: 'glow', count: 26, vx: 6, vy: -4, spread: 0.5, wander: 70, period: 6, size: [30, 42], spin: 0, twinkle: 0.35, alpha: 0.9,
    colors: [0xd8f070, 0xf0f8a0] },
  { shape: 'dot', count: 40, vx: -25, vy: 120, spread: 0.35, wander: 30, period: 2.6, size: [12, 20], spin: 0, twinkle: 0, alpha: 0.85,
    colors: [0xf4f8ff, 0xdce6f4] },
  { shape: 'glow', count: 22, vx: 8, vy: -40, spread: 0.4, wander: 45, period: 4.5, size: [28, 40], spin: 0, twinkle: 0.2, alpha: 0.75,
    colors: [0xb8f0f0, 0xd8f8ff] },
  { shape: 'flake', count: 32, vx: 30, vy: 45, spread: 0.5, wander: 40, period: 3.6, size: [14, 22], spin: 0.4, twinkle: 0, alpha: 0.8,
    colors: [0xd8d4d0, 0xb8b4c0, 0x9c98a4] },
];

/** The corgi's planets, 1 to 5: no warm specks, which would read as his shots. */
export const CORGI_AMBIENT: readonly AmbientStyle[] = [
  { shape: 'dot', count: 26, vx: 15, vy: 50, spread: 0.4, wander: 40, period: 4, size: [10, 16], spin: 0, twinkle: 0.4, alpha: 0.8,
    colors: [0xf4f8ff, 0xc8e0f8] },
  { shape: 'glow', count: 26, vx: 5, vy: -25, spread: 0.5, wander: 60, period: 5.5, size: [26, 38], spin: 0, twinkle: 0.3, alpha: 0.85,
    colors: [0xc8f070, 0xa0e8a0] },
  { shape: 'flake', count: 34, vx: 130, vy: 20, spread: 0.4, wander: 25, period: 2.4, size: [9, 14], spin: 0.6, twinkle: 0, alpha: 0.7,
    colors: [0xf0dcb0, 0xd8bc88] },
  { shape: 'flake', count: 32, vx: 20, vy: -35, spread: 0.5, wander: 40, period: 3.6, size: [12, 18], spin: 0.4, twinkle: 0, alpha: 0.7,
    colors: [0xb8b4c0, 0x8c8898] },
  { shape: 'glow', count: 22, vx: -6, vy: -18, spread: 0.5, wander: 55, period: 5, size: [24, 34], spin: 0, twinkle: 0.25, alpha: 0.75,
    colors: [0xe8f0a0, 0xc0e8d0] },
];

/** This build's table. */
export const AMBIENT = THEME === 'corgi' ? CORGI_AMBIENT : MONK_AMBIENT;

/** The box round the camera the specks wrap across, world units: wider and taller than any view. */
export const AMBIENT_BOX = { w: 1500, h: 2800 };

/** At full heat only this share of the specks is drawn, this much fainter (fxHeat.ts). */
export const AMBIENT_HOT = { count: 0.4, alpha: 0.7 };

export interface AmbientSpeck {
  x: number;
  y: number;
  rotation: number;
  size: number;
  color: number;
  alpha: number;
}

/** A fixed pseudo-random share in [0, 1) for speck `i`'s trait `k`. */
export function share(i: number, k: number): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** How many of the style's specks are drawn at this heat (0 quiet .. 1 a full late screen);
 * the last one, fractional, is part faded, so specks thin out smoothly as the heat climbs. */
export function ambientCount(style: AmbientStyle, heat: number): number {
  const h = Math.min(1, Math.max(0, heat));
  return style.count * (1 - (1 - AMBIENT_HOT.count) * h);
}

/** Speck `i` of `style` at `time` seconds, near the camera at (cx, cy), at this heat. */
export function ambientAt(style: AmbientStyle, i: number, time: number, cx: number, cy: number, heat = 0): AmbientSpeck {
  const { w, h } = AMBIENT_BOX;
  const pace = 1 + style.spread * (share(i, 1) * 2 - 1);
  const phase = share(i, 3) * Math.PI * 2;
  const turn = (time / style.period) * Math.PI * 2 + phase;
  // the wander crosses the drift line; fireflies, barely drifting, circle on two periods
  const wx = Math.sin(turn) * style.wander;
  const wy = Math.sin(turn * 0.71 + phase) * style.wander * 0.6;
  const x = wrapNear(share(i, 2) * w + style.vx * pace * time + wx, cx, w);
  const y = wrapNear(share(i, 4) * h + style.vy * pace * time + wy, cy, h);
  // faint near the box's edges, where a speck wraps over to the other side
  const edge = (d: number, span: number) => Math.min(1, (span / 2 - Math.abs(d)) / (span * 0.12));
  let alpha = style.alpha * Math.max(0, Math.min(edge(x - cx, w), edge(y - cy, h)));
  if (style.twinkle) alpha *= 0.55 + 0.45 * Math.sin(time * style.twinkle * Math.PI * 2 + phase * 3);
  alpha *= 1 - (1 - AMBIENT_HOT.alpha) * Math.min(1, Math.max(0, heat));
  alpha *= Math.min(1, Math.max(0, ambientCount(style, heat) - i));
  return {
    x,
    y,
    rotation: style.spin ? Math.sin(turn) * 0.6 + time * style.spin * (share(i, 5) - 0.5) * Math.PI * 2 : 0,
    size: style.size[0] + (style.size[1] - style.size[0]) * share(i, 6),
    color: style.colors[Math.floor(share(i, 7) * style.colors.length)],
    alpha,
  };
}
