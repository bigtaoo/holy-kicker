// Short-lived effect particles: hit sparks, death puffs and spell shapes. Pure simulation in
// a flat pool (swap-remove, spent particles recycled), drawn by fxView.ts.
//
// The pool also keeps a running fill estimate: the area every live particle's quad covers at
// its largest, in world units squared. The GPU shades every pixel of a quad, transparent or
// not, so this is what effects cost in fill rate. Optional particles (smoke, sparks) are
// dropped once the fill passes the budget, so a big spell that kills a hundred mobs at once
// cannot flood the screen with overdraw.
//
// Particles come in tiers (FX_TIER), and a lesser tier may only fill a smaller share of the
// budget, so when the screen is full the smoke of the hundredth kill goes before the hero's own
// blow does. The hero's hits and the mobs' downs also scale with the battle's heat (fxHeat.ts):
// big in a quiet opening, small pops once kills come by the dozen, and kills close together in
// place and time share one pop.

import { byHeat } from './fxHeat';

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

/** Who a particle is for. `must` always shows while the pool has room (hurt, elite and boss,
 *  warnings); `hero` is the hero's own blow; `garnish` the sparks and smoke of hits and kills;
 *  `ambient` the dust that only a quiet screen has room for. */
export const FX_TIER = { must: 0, hero: 1, garnish: 2, ambient: 3 } as const;
export type FxTier = (typeof FX_TIER)[keyof typeof FX_TIER];
/** Share of the fill budget each tier may fill the pool up to. */
const TIER_SHARE = [Infinity, 1, 0.75, 0.35];
/** Share of the pool's slots kept for `must` particles. */
const MUST_SLOTS = 0.1;

/** Downs this close in place (world units, each axis) and time (s) share one pop. */
export const DOWN_MERGE = { dist: 140, time: 0.1 };
const RECENT = 16;
/** Kills farther than this from the hero shrink as the heat rises: the eye is on the hero. */
const FAR = 650;

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
  /** The battle's heat, 0..1 (fxHeat.ts), and the hero's place: the game sets them each frame. */
  heat = 0;
  focusX = 0;
  focusY = 0;
  /** Seconds stepped, and the last downs' places and times, for merging. */
  private clock = 0;
  private readonly recent = Array.from({ length: RECENT }, () => ({ x: 0, y: 0, t: -1 }));
  private recentAt = 0;

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

  /**
   * False if the particle was not emitted: the pool is full, or its tier's share of it is.
   * `true` is the garnish tier, `false` (the default) must.
   */
  emit(p: FxSpec, tier: FxTier | boolean = false): boolean {
    const t = tier === true ? FX_TIER.garnish : tier === false ? FX_TIER.must : tier;
    if (this.live.length >= this.max) return false;
    const cost = fxCost(p);
    if (t !== FX_TIER.must && (this.fill + cost > this.budget * TIER_SHARE[t] || this.live.length >= this.max * (1 - MUST_SLOTS))) {
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

  /**
   * The hero's blow landing at (x, y), coming along (dx, dy) when known: a white flash, a ring
   * and sparks spraying on in the blow's direction. Big while the battle is quiet, small when hot.
   */
  hit(x: number, y: number, dx = 0, dy = 0): void {
    const r = this.rand;
    const k = byHeat(this.heat, 1.3, 0.7);
    const hero = FX_TIER.hero;
    this.emit({ shape: 'glow', x, y, vx: 0, vy: 0, life: 0.09, size0: 80 * k, size1: 40 * k, rotation: 0, spin: 0, drag: 1, color: 0xffffff, alpha: 0.9 }, hero);
    this.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.18, size0: 20, size1: 110 * k, rotation: 0, spin: 0, drag: 1, color: 0xfff4c0, alpha: 0.9 }, hero);
    const len = Math.hypot(dx, dy);
    const aim = len > 0 ? Math.atan2(dy, dx) : 0;
    const n = Math.round(byHeat(this.heat, 12, 4));
    for (let i = 0; i < n; i++) {
      // two in three spray on along the blow, the rest all round
      const along = len > 0 && i % 3 !== 2;
      const a = along ? aim + (r() - 0.5) * 1.6 : (i / n) * Math.PI * 2 + r() * 0.5;
      const v = (along ? 600 : 450) + r() * 450;
      this.emit({
        shape: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.22 + r() * 0.12,
        size0: (26 + r() * 14) * k, size1: 4, rotation: r() * Math.PI, spin: (r() - 0.5) * 20, drag: 0.02,
        color: i % 3 ? 0xffe27a : 0xffffff, alpha: 1,
      }, i < 4 ? hero : FX_TIER.garnish);
    }
  }

  /** A knocked-down mob dissolving: grey-teal smoke rising from its feet. */
  puff(x: number, y: number, n = 8): void {
    const r = this.rand;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.emit({
        shape: 'puff', x: x + Math.cos(a) * 18, y: y - 20 + Math.sin(a) * 8,
        vx: Math.cos(a) * (60 + r() * 60), vy: -60 - r() * 90, life: 0.45 + r() * 0.25,
        size0: 30 + r() * 15, size1: 70 + r() * 30, rotation: r() * Math.PI, spin: (r() - 0.5) * 2, drag: 0.15,
        color: i % 2 ? 0x8fa6a3 : 0x6f7f8c, alpha: 0.75,
      }, true);
    }
  }

  /**
   * A mob knocked down: a pale cold pop where it stood and a few chips flying off, over the
   * smoke, so a kill reads at a glance even at the edge of the screen. As the battle heats up
   * the pop shrinks (more so far from the hero), and a down right beside one just shown only
   * adds a little smoke to it.
   */
  down(x: number, y: number): void {
    const r = this.rand;
    const heat = this.heat;
    if (this.mergeDown(x, y)) {
      this.puff(x, y, Math.round(byHeat(heat, 4, 2)));
      return;
    }
    const far = Math.hypot(x - this.focusX, y - this.focusY) > FAR ? byHeat(heat, 1, 0.6) : 1;
    const k = byHeat(heat, 1.25, 0.75) * far;
    this.emit({ shape: 'ring', x, y: y - 40, vx: 0, vy: 0, life: 0.2, size0: 30, size1: 150 * k, rotation: 0, spin: 0, drag: 1, color: 0xe2f2ee, alpha: 0.85 }, true);
    const n = Math.max(1, Math.round(byHeat(heat, 7, 2) * far));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.6;
      const v = 380 + r() * 320;
      this.emit({
        shape: 'spark', x, y: y - 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.25 + r() * 0.1,
        size0: (30 + r() * 12) * k, size1: 4, rotation: r() * Math.PI, spin: (r() - 0.5) * 16, drag: 0.03,
        color: i % 2 ? 0xbfe6ec : 0xffffff, alpha: 1,
      }, true);
    }
    this.puff(x, y, Math.round(byHeat(heat, 8, 3)));
  }

  /** True if a down was shown near (x, y) just now; otherwise remembers this one. */
  private mergeDown(x: number, y: number): boolean {
    for (const d of this.recent) {
      if (d.t >= 0 && this.clock - d.t <= DOWN_MERGE.time && Math.abs(d.x - x) <= DOWN_MERGE.dist && Math.abs(d.y - y) <= DOWN_MERGE.dist) {
        return true;
      }
    }
    const d = this.recent[this.recentAt];
    this.recentAt = (this.recentAt + 1) % RECENT;
    d.x = x;
    d.y = y;
    d.t = this.clock;
    return false;
  }

  /** Dust kicked up behind the hero's feet as he runs (facing -1 or 1); only a quiet screen has room for it. */
  dust(x: number, y: number, facing: number): void {
    const r = this.rand;
    for (let i = 0; i < 2; i++) {
      this.emit({
        shape: 'puff', x: x - facing * (10 + r() * 16), y: y - 4, vx: -facing * (40 + r() * 50), vy: -30 - r() * 40,
        life: 0.35 + r() * 0.15, size0: 18 + r() * 8, size1: 44 + r() * 14, rotation: r() * Math.PI, spin: (r() - 0.5) * 2,
        drag: 0.2, color: 0xcbbf9e, alpha: 0.4,
      }, FX_TIER.ambient);
    }
  }

  step(dt: number): void {
    this.clock += dt;
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
