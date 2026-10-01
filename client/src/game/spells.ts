import type { FxPool } from './fx';

// Spell effects for the area-damage stress test, emitted as pool particles. Pure, so their
// particle counts and fill can be tested without Pixi.
//
// Rings come two ways. 'quad' is one ring sprite scaled to the full diameter: one particle,
// but the GPU shades the whole (2r)^2 square, most of it transparent. 'band' builds the ring
// from short bar segments along the circle, so only the band itself is shaded.

export type RingMode = 'band' | 'quad';

const SEGMENTS = 28;
/** Segment length over the arc it covers, so neighbours overlap a little. */
const OVERLAP = 1.12;

/** An expanding ring from radius r0 to r1 over `life` seconds; `thick` is band over radius. */
export function nova(pool: FxPool, x: number, y: number, r0: number, r1: number, life: number, color: number, mode: RingMode, thick = 0.12): void {
  if (mode === 'quad') {
    pool.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life, size0: r0 * 2.2, size1: r1 * 2.2, rotation: 0, spin: 0, drag: 1, color, alpha: 0.9 });
    return;
  }
  const arc = ((Math.PI * 2) / SEGMENTS) * OVERLAP;
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const v = (r1 - r0) / life;
    pool.emit({
      shape: 'band', x: x + c * r0, y: y + s * r0, vx: c * v, vy: s * v, life,
      size0: r0 * arc, size1: r1 * arc, aspect: thick / arc, rotation: a + Math.PI / 2, spin: 0, drag: 1, color, alpha: 0.9,
    });
  }
}

/** A meteor or bomb landing: a flash, a shock ring, smoke and sparks. */
export function explosion(pool: FxPool, rand: () => number, x: number, y: number, r: number, mode: RingMode): void {
  pool.emit({ shape: 'glow', x, y: y - r * 0.2, vx: 0, vy: 0, life: 0.22, size0: r * 1.4, size1: r * 2, rotation: 0, spin: 0, drag: 1, color: 0xffe6a0, alpha: 0.85 });
  nova(pool, x, y, r * 0.2, r * 1.1, 0.3, 0xfff2c8, mode, 0.16);
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const v = r * (0.6 + rand() * 0.8);
    pool.emit({
      shape: 'puff', x, y: y - r * 0.15, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - r * 0.4, life: 0.5 + rand() * 0.3,
      size0: r * 0.35, size1: r * 0.8, rotation: rand() * Math.PI, spin: (rand() - 0.5) * 2, drag: 0.1, color: i % 2 ? 0x7d6f86 : 0x5d5f73, alpha: 0.7,
    }, true);
  }
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    const v = r * (2 + rand() * 2);
    pool.emit({
      shape: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + rand() * 0.15,
      size0: 34, size1: 6, rotation: rand() * Math.PI, spin: (rand() - 0.5) * 20, drag: 0.03, color: 0xffd36a, alpha: 1,
    }, true);
  }
}

/** A lightning bolt from (x0, y0) to (x1, y1): a few jagged bar segments and a spark at the end. */
export function bolt(pool: FxPool, rand: () => number, x0: number, y0: number, x1: number, y1: number): void {
  const n = 4;
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  let px = x0;
  let py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const j = i === n ? 0 : (rand() - 0.5) * 0.25;
    const qx = x0 + (x1 - x0) * t + nx * j;
    const qy = y0 + (y1 - y0) * t + ny * j;
    const len = Math.hypot(qx - px, qy - py) * 1.08;
    pool.emit({
      shape: 'band', x: (px + qx) / 2, y: (py + qy) / 2, vx: 0, vy: 0, life: 0.16, size0: len, size1: len,
      aspect: 16 / Math.max(1, len), rotation: Math.atan2(qy - py, qx - px), spin: 0, drag: 1, color: 0xc8f0ff, alpha: 1,
    });
    px = qx;
    py = qy;
  }
  pool.emit({ shape: 'glow', x: x1, y: y1, vx: 0, vy: 0, life: 0.16, size0: 70, size1: 110, rotation: 0, spin: 0, drag: 1, color: 0xe0f8ff, alpha: 0.9 });
}

/** Light motes rising from a ground field of radius r. */
export function fieldMotes(pool: FxPool, rand: () => number, x: number, y: number, r: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r;
    pool.emit({
      shape: 'glow', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.45, vx: 0, vy: -120 - rand() * 120, life: 0.6 + rand() * 0.4,
      size0: 28, size1: 8, rotation: 0, spin: 0, drag: 1, color: i % 2 ? 0xfff0a8 : 0xffc860, alpha: 0.9,
    }, true);
  }
}
