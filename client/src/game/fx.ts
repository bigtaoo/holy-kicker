// Short-lived effect particles: hit sparks, death puffs and spell shapes. Pure simulation in
// a flat pool (swap-remove, spent particles recycled), drawn by fxView.ts.
//
// The pool also keeps a running fill estimate: the area every live particle's quad covers at
// its largest, in world units squared. The GPU shades every pixel of a quad, transparent or
// not, so this is what effects cost in fill rate. Optional particles (smoke, sparks) are
// dropped once the fill passes the budget, so a big spell that kills a hundred mobs at once
// cannot flood the screen with overdraw.

export type FxShape = 'spark' | 'puff' | 'ring' | 'glow' | 'band';

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
  /** Height over width; size is the width. */
  aspect: number;
  /** Fill this particle adds to the pool's estimate. */
  cost: number;
}

export type FxSpec = Omit<FxParticle, 'age' | 'aspect' | 'cost'> & { aspect?: number };

/** Fill a particle's quad covers at its largest, world units squared. */
export function fxCost(p: FxSpec): number {
  const s = Math.max(p.size0, p.size1);
  return s * s * (p.aspect ?? 1);
}

export class FxPool {
  readonly live: FxParticle[] = [];
  private readonly free: FxParticle[] = [];
  /** Sum of the live particles' costs. */
  fill = 0;
  /** Optional particles emitted and dropped over the budget, for tuning. */
  dropped = 0;

  constructor(
    readonly max: number,
    private readonly rand: () => number = Math.random,
    /** Fill above which optional particles are dropped, world units squared. */
    public budget = Infinity,
  ) {}

  /** Allocates spent particles up front so the first big spell does not stall on allocation. */
  prewarm(n: number): void {
    while (this.free.length + this.live.length < Math.min(n, this.max)) {
      this.free.push({
        shape: 'spark', x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size0: 0, size1: 0,
        rotation: 0, spin: 0, drag: 1, color: 0, alpha: 0, aspect: 1, cost: 0,
      });
    }
  }

  /** False if the particle was not emitted: the pool is full, or it is optional and over budget. */
  emit(p: FxSpec, optional = false): boolean {
    if (this.live.length >= this.max) return false;
    const cost = fxCost(p);
    if (optional && this.fill + cost > this.budget) {
      this.dropped++;
      return false;
    }
    const q = this.free.pop() ?? ({} as FxParticle);
    Object.assign(q, p);
    q.aspect = p.aspect ?? 1;
    q.cost = cost;
    q.age = 0;
    this.fill += cost;
    this.live.push(q);
    return true;
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
      }, true);
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
      }, true);
    }
  }

  step(dt: number): void {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.fill -= p.cost;
        live[i] = live[live.length - 1];
        live.pop();
        this.free.push(p);
        continue;
      }
      const k = Math.pow(p.drag, dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
    }
    // no float drift once everything has expired
    if (live.length === 0) this.fill = 0;
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
