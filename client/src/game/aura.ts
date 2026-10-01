import type { FxParticle, FxPool } from './fx';

// Stacked buff visuals around the hero, one layer per buff: a spinning segmented halo and two
// orbiting orbs leaving trails. The halo and orbs are long-lived particles owned here and drawn
// by the FxLayer; trails go into the pool as optional particles, so they obey the fill budget.

const SEGMENTS = 18;
const COLORS = [0xffd24a, 0xfff0b0, 0xff9a3a, 0x9fe0ff, 0xd8a8ff, 0xffffff];
const TRAIL_EVERY = 1 / 30;

function still(shape: FxParticle['shape'], color: number, size: number, aspect: number, alpha: number): FxParticle {
  return { shape, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: Infinity, size0: size, size1: size, rotation: 0, spin: 0, drag: 1, color, alpha, aspect, cost: 0 };
}

export class AuraStack {
  readonly parts: FxParticle[] = [];
  private time = 0;
  private trail = 0;

  constructor(readonly layers: number) {
    for (let l = 0; l < layers; l++) {
      const c = COLORS[l % COLORS.length];
      const r = this.radius(l);
      const arc = ((Math.PI * 2 * r) / SEGMENTS) * 0.6;
      for (let i = 0; i < SEGMENTS; i++) this.parts.push(still('band', c, arc, 10 / arc, 0.75));
      this.parts.push(still('glow', c, 46, 1, 1), still('glow', c, 46, 1, 1));
    }
  }

  /** Halo radius of layer l, world units (an ellipse squashed onto the ground). */
  radius(l: number): number {
    return 95 + l * 22;
  }

  update(dt: number, hx: number, hy: number, pool: FxPool): void {
    this.time += dt;
    this.trail -= dt;
    const emitTrail = this.trail <= 0;
    if (emitTrail) this.trail = TRAIL_EVERY;
    let k = 0;
    for (let l = 0; l < this.layers; l++) {
      const r = this.radius(l);
      const turn = this.time * (l % 2 ? -1.2 : 0.9);
      for (let i = 0; i < SEGMENTS; i++) {
        const a = turn + (i / SEGMENTS) * Math.PI * 2;
        const p = this.parts[k++];
        p.x = hx + Math.cos(a) * r;
        p.y = hy + Math.sin(a) * r * 0.38;
        // tangent of the squashed ellipse
        p.rotation = Math.atan2(Math.cos(a) * 0.38, -Math.sin(a));
      }
      for (let o = 0; o < 2; o++) {
        const a = this.time * 2.4 * (l % 2 ? -1 : 1) + o * Math.PI + l;
        const p = this.parts[k++];
        p.x = hx + Math.cos(a) * (r + 30);
        p.y = hy - 60 + Math.sin(a) * (r + 30) * 0.5;
        if (emitTrail) {
          pool.emit({ shape: 'glow', x: p.x, y: p.y, vx: 0, vy: 0, life: 0.3, size0: 34, size1: 6, rotation: 0, spin: 0, drag: 1, color: p.color, alpha: 0.7 }, true);
        }
      }
    }
  }
}
