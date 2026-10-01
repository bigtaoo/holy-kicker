// Short-lived effect particles: hit sparks and death puffs. Pure simulation in a flat
// pool (swap-remove, no per-frame allocation), drawn by fxView.ts.

export type FxShape = 'spark' | 'puff' | 'ring';

export interface FxParticle {
  shape: FxShape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds lived, and the total. */
  age: number;
  life: number;
  /** Size (px, world units) at birth and death. */
  size0: number;
  size1: number;
  rotation: number;
  spin: number;
  /** Velocity kept per second (1 = no drag). */
  drag: number;
  color: number;
  /** Peak opacity. */
  alpha: number;
}

export class FxPool {
  readonly live: FxParticle[] = [];

  constructor(
    readonly max: number,
    private readonly rand: () => number = Math.random,
  ) {}

  emit(p: Omit<FxParticle, 'age'>): void {
    if (this.live.length >= this.max) return;
    this.live.push({ ...p, age: 0 });
  }

  /** Impact: a flash ring and sparks flying out from (x, y). */
  hit(x: number, y: number): void {
    const r = this.rand;
    this.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.18, size0: 20, size1: 110, rotation: 0, spin: 0, drag: 1, color: 0xfff4c0, alpha: 0.9 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.5;
      const v = 450 + r() * 450;
      this.emit({
        shape: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.22 + r() * 0.12,
        size0: 26 + r() * 14, size1: 4, rotation: r() * Math.PI, spin: (r() - 0.5) * 20, drag: 0.02,
        color: i % 3 ? 0xffe27a : 0xffffff, alpha: 1,
      });
    }
  }

  /** A knocked-down mob dissolving: grey-teal smoke rising from its feet. */
  puff(x: number, y: number): void {
    const r = this.rand;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.emit({
        shape: 'puff', x: x + Math.cos(a) * 18, y: y - 20 + Math.sin(a) * 8,
        vx: Math.cos(a) * (60 + r() * 60), vy: -60 - r() * 90, life: 0.45 + r() * 0.25,
        size0: 30 + r() * 15, size1: 70 + r() * 30, rotation: r() * Math.PI, spin: (r() - 0.5) * 2, drag: 0.15,
        color: i % 2 ? 0x8fa6a3 : 0x6f7f8c, alpha: 0.75,
      });
    }
  }

  step(dt: number): void {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        live[i] = live[live.length - 1];
        live.pop();
        continue;
      }
      const k = Math.pow(p.drag, dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
    }
  }
}

/** 0..1 through a particle's life. */
export function fxProgress(p: FxParticle): number {
  return Math.min(1, p.age / p.life);
}

export function fxSize(p: FxParticle): number {
  return p.size0 + (p.size1 - p.size0) * fxProgress(p);
}

/** Full opacity for the first half of its life, then fading out. */
export function fxAlpha(p: FxParticle): number {
  const t = fxProgress(p);
  return p.alpha * (t < 0.5 ? 1 : 2 * (1 - t));
}
