// Experience gems on the ground: pure state, drawn by dropView.ts.
//
// A horde survivor drops a gem per kill, so a long run leaves thousands on the map. Two rules
// keep that bounded without losing experience:
// - one gem per merge cell: a drop that lands on a cell holding a resting gem adds its value
//   to it (the gem looks bigger as its value grows), so on-screen gems never exceed the cell
//   count and a cleared crowd leaves a few big gems instead of a carpet of small ones;
// - a cap on resting gems: past it, drops feed one overflow gem that collects everything the
//   map could not hold, wherever it lies.
// Gems within the magnet radius of the hero fly to him and are collected on contact. Resting
// gems are found by looking up the cells around the hero, never by scanning them all.

/** Gem colour sets compared for readability (2026-10-01): pink stands out best. */
export type GemPalette = 'ice' | 'pink' | 'lime';
export const GEM_PALETTES: readonly GemPalette[] = ['ice', 'pink', 'lime'];

export interface Gem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  /** 0..2 by value, OVERFLOW_TIER for the overflow gem. */
  tier: number;
  /** Seconds since dropped, or since it started flying. */
  age: number;
  flying: boolean;
  /** Merge cell it rests in; -1 for the overflow gem. */
  cell: number;
}

export interface DropParams {
  /** Merge cell size, world units. */
  cell: number;
  /** Resting gems kept on the map before drops go to the overflow gem. */
  max: number;
  /** Distance at which a resting gem starts flying to the hero, and at which it is collected. */
  magnet: number;
  pickup: number;
}

export const DROPS: DropParams = { cell: 80, max: 400, magnet: 230, pickup: 45 };
/** Values at which a gem grows to the next look. */
export const TIER_VALUES = [10, 50];
export const OVERFLOW_TIER = TIER_VALUES.length + 1;
/** A flying gem first hops away from the hero, then accelerates past his top speed. */
const HOP = 380;
const ACCEL = 4200;
const MAX_SPEED = 2000;

export function tierOf(value: number): number {
  let t = 0;
  while (t < TIER_VALUES.length && value >= TIER_VALUES[t]) t++;
  return t;
}

function blank(): Gem {
  return { x: 0, y: 0, vx: 0, vy: 0, value: 0, tier: 0, age: 0, flying: false, cell: -1 };
}

export class DropField {
  /** Resting and flying gems, the overflow gem included. */
  readonly gems: Gem[] = [];
  /** Experience collected so far. */
  collected = 0;
  /** Gems collected during the last step, for the pickup effect. */
  readonly picked: Gem[] = [];
  private resting = 0;
  private overflow: Gem | null = null;
  private readonly free: Gem[] = [];
  private readonly cells = new Map<number, Gem>();
  private readonly inv: number;

  constructor(readonly params: DropParams = DROPS) {
    this.inv = 1 / params.cell;
  }

  get restingCount(): number {
    return this.resting;
  }

  drop(x: number, y: number, value: number): void {
    const cell = this.cellOf(Math.floor(x * this.inv), Math.floor(y * this.inv));
    const here = this.cells.get(cell);
    if (here) return this.add(here, value);
    if (this.resting >= this.params.max) {
      if (this.overflow) return this.add(this.overflow, value);
      this.overflow = this.spawn(x, y, value, -1);
      this.overflow.tier = OVERFLOW_TIER;
      return;
    }
    this.cells.set(cell, this.spawn(x, y, value, cell));
    this.resting++;
  }

  /** Every gem on the map flies to the hero (a vacuum pickup). */
  attractAll(hx: number, hy: number): void {
    for (const g of this.gems) if (!g.flying) this.launch(g, hx, hy);
  }

  step(dt: number, hx: number, hy: number): void {
    this.picked.length = 0;
    this.attractNear(hx, hy);
    const pick2 = this.params.pickup * this.params.pickup;
    const gems = this.gems;
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      g.age += dt;
      if (!g.flying) continue;
      const dx = hx - g.x;
      const dy = hy - g.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < pick2) {
        this.collected += g.value;
        this.picked.push(g);
        gems[i] = gems[gems.length - 1];
        gems.pop();
        this.free.push(g);
        continue;
      }
      // steer the velocity toward the hero while the speed builds up
      const d = Math.sqrt(d2);
      const speed = Math.min(MAX_SPEED, Math.hypot(g.vx, g.vy) + ACCEL * dt);
      const turn = Math.min(1, dt * 10);
      g.vx += ((dx / d) * speed - g.vx) * turn;
      g.vy += ((dy / d) * speed - g.vy) * turn;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }
  }

  /** Resting gems in the cells overlapping the magnet circle start flying. */
  private attractNear(hx: number, hy: number): void {
    const { magnet } = this.params;
    const m2 = magnet * magnet;
    const x0 = Math.floor((hx - magnet) * this.inv);
    const x1 = Math.floor((hx + magnet) * this.inv);
    const y0 = Math.floor((hy - magnet) * this.inv);
    const y1 = Math.floor((hy + magnet) * this.inv);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const g = this.cells.get(this.cellOf(cx, cy));
        if (g && (g.x - hx) ** 2 + (g.y - hy) ** 2 < m2) this.launch(g, hx, hy);
      }
    }
    const o = this.overflow;
    if (o && !o.flying && (o.x - hx) ** 2 + (o.y - hy) ** 2 < m2) this.launch(o, hx, hy);
  }

  private launch(g: Gem, hx: number, hy: number): void {
    if (g.cell >= 0) {
      this.cells.delete(g.cell);
      this.resting--;
    } else this.overflow = null;
    g.flying = true;
    g.age = 0;
    const d = Math.hypot(g.x - hx, g.y - hy) || 1;
    g.vx = ((g.x - hx) / d) * HOP;
    g.vy = ((g.y - hy) / d) * HOP;
  }

  private spawn(x: number, y: number, value: number, cell: number): Gem {
    const g = this.free.pop() ?? blank();
    g.x = x;
    g.y = y;
    g.vx = g.vy = 0;
    g.value = value;
    g.tier = tierOf(value);
    g.age = 0;
    g.flying = false;
    g.cell = cell;
    this.gems.push(g);
    return g;
  }

  private add(g: Gem, value: number): void {
    g.value += value;
    if (g.tier !== OVERFLOW_TIER) g.tier = tierOf(g.value);
  }

  private cellOf(cx: number, cy: number): number {
    // world coordinates stay well inside +-2^15 cells
    return (cx + 32768) * 65536 + cy + 32768;
  }
}
