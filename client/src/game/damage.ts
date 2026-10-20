// Floating damage numbers: pure motion and digit layout in a flat pool (swap-remove),
// drawn by damageView.ts as one particle per digit. Expired numbers are recycled.
//
// Numbers merge so a big spell does not print a wall of digits: hits that land close
// together within a few frames add up into one number, and repeated hits on a target that
// survives (an elite, a boss) keep adding to that target's number while they keep coming.
//
// Plain numbers (no crit, no target key: ordinary mobs) answer the run's heat, 0 on an
// empty opening screen to 1 in a late game full of kills: they punch a little harder early,
// shrink and fade as the screen fills, and stop spawning near the top. Crits and the
// numbers of elites and bosses always show in full.

export interface DamageNumber {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  value: number;
  /** Merge cell this number was spawned in, and its target key (-1 for none). */
  cell: number;
  key: number;
  /** Decimal digits, most significant first. */
  digits: number[];
  crit: boolean;
  /** Size and alpha factors fixed at spawn from the heat (1 for crits and keyed numbers). */
  size: number;
  fade: number;
}

/** Crit looks compared for readability: gold is the hero's own colour. */
export type CritLook = 'gold' | 'red' | 'orange';
export const CRIT_LOOKS: readonly CritLook[] = ['gold', 'red', 'orange'];

export const DAMAGE_LIFE = 0.75;
const POP_TIME = 0.12;
const RISE = 520;
/** Velocity kept per second. */
const DRAG = 0.03;
const CRIT_SCALE = 1.5;
/** Hits within this many world units and seconds of a fresh number join it. */
export const MERGE_CELL = 140;
export const MERGE_AGE = 0.1;
/** A surviving target's number keeps collecting hits that come at most this far apart. */
export const KEY_MERGE_GAP = 0.35;
const MAX_CELLS = 4096;

/** Plain numbers at heat 0 are this much bigger than the base size. */
export const PLAIN_PUNCH = 1.15;
/** From this heat plain numbers shrink and fade, down to the floor below at the cut-off... */
export const HEAT_TAPER = 0.3;
/** ...and from this heat on they are not spawned at all. */
export const HEAT_CUTOFF = 0.6;
const PLAIN_MIN_SIZE = 0.7;
const PLAIN_MIN_FADE = 0.45;

function blank(): DamageNumber {
  return { x: 0, y: 0, vx: 0, vy: 0, age: 0, value: 0, cell: 0, key: -1, digits: [], crit: false, size: 1, fade: 1 };
}

function cellOf(x: number, y: number): number {
  // world coordinates stay well inside +-2^15 cells
  return (Math.floor(x / MERGE_CELL) + 32768) * 65536 + Math.floor(y / MERGE_CELL) + 32768;
}

/** 0 below the taper, easing to 1 at the cut-off. */
function taper(heat: number): number {
  const t = Math.min(1, Math.max(0, (heat - HEAT_TAPER) / (HEAT_CUTOFF - HEAT_TAPER)));
  return t * t * (3 - 2 * t);
}

/** Size factor of a plain number spawned at this heat (0 from the cut-off on: not spawned). */
export function plainSize(heat: number): number {
  if (heat >= HEAT_CUTOFF) return 0;
  return PLAIN_PUNCH + (PLAIN_MIN_SIZE - PLAIN_PUNCH) * taper(heat);
}

/** Alpha factor of a plain number spawned at this heat (0 from the cut-off on). */
export function plainFade(heat: number): number {
  if (heat >= HEAT_CUTOFF) return 0;
  return 1 + (PLAIN_MIN_FADE - 1) * taper(heat);
}

export class DamagePool {
  readonly live: DamageNumber[] = [];
  /** How full the run is, 0..1; the game sets it every frame. */
  heat = 0;
  private readonly free: DamageNumber[] = [];
  /** Freshest number per merge cell and per target key; entries are checked on use. */
  private readonly cells = new Map<number, DamageNumber>();
  private readonly keyed = new Map<number, DamageNumber>();

  constructor(
    /** Numbers on screen at once; the quality level lowers it. */
    public max: number,
    private readonly rand: () => number = Math.random,
  ) {}

  prewarm(n: number): void {
    while (this.free.length + this.live.length < n) this.free.push(blank());
  }

  /**
   * Shows `value` at (x, y). `key` names a target that survives the hit (an elite or boss),
   * so its hits gather into one number; targets that die from the hit pass -1.
   */
  spawn(x: number, y: number, value: number, crit: boolean, key = -1): void {
    if (key >= 0) {
      const d = this.keyed.get(key);
      if (d && d.key === key && d.age < KEY_MERGE_GAP) {
        // the number follows its target and pops again with each hit
        this.launch(d, x, y, d.value + value, d.crit || crit);
        d.size = d.fade = 1;
        return;
      }
    }
    const cell = cellOf(x, y);
    const near = key < 0 ? this.cells.get(cell) : undefined;
    if (near && near.cell === cell && near.key < 0 && near.age < MERGE_AGE) {
      near.value += value;
      if (crit && !near.crit) {
        // a crit joining makes it a crit number, which heat never dims
        near.crit = true;
        near.size = near.fade = 1;
      }
      digitsOf(near.value, near.digits);
      return;
    }
    const plain = !crit && key < 0;
    if (plain && this.heat >= HEAT_CUTOFF) return;
    if (this.live.length >= this.max) return;
    const d = this.free.pop() ?? blank();
    this.launch(d, x, y, value, crit);
    d.size = plain ? plainSize(this.heat) : 1;
    d.fade = plain ? plainFade(this.heat) : 1;
    d.cell = cell;
    d.key = key;
    this.live.push(d);
    if (key >= 0) this.keyed.set(key, d);
    else {
      if (this.cells.size >= MAX_CELLS) this.cells.clear();
      this.cells.set(cell, d);
    }
  }

  private launch(d: DamageNumber, x: number, y: number, value: number, crit: boolean): void {
    const r = this.rand;
    d.x = x + (r() - 0.5) * 30;
    d.y = y;
    d.vx = (r() - 0.5) * 160;
    d.vy = -RISE * (crit ? 1.2 : 1);
    d.age = 0;
    d.value = value;
    d.crit = crit;
    digitsOf(value, d.digits);
  }

  step(dt: number): void {
    const live = this.live;
    const k = Math.pow(DRAG, dt);
    for (let i = live.length - 1; i >= 0; i--) {
      const d = live[i];
      d.age += dt;
      if (d.age >= DAMAGE_LIFE) {
        live[i] = live[live.length - 1];
        live.pop();
        this.free.push(d);
        continue;
      }
      d.vx *= k;
      d.vy *= k;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
  }
}

/** Decimal digits of the rounded value, most significant first, written into `out`. */
export function digitsOf(value: number, out: number[] = []): number[] {
  let v = Math.max(0, Math.round(value));
  out.length = 0;
  do {
    out.push(v % 10);
    v = Math.floor(v / 10);
  } while (v > 0);
  return out.reverse();
}

/** Size multiplier: pops in large, settles; crits stay bigger. */
export function damageScale(d: DamageNumber): number {
  const t = d.age / POP_TIME;
  return (d.crit ? CRIT_SCALE : d.size) * (t < 1 ? 1.8 - 0.8 * t : 1);
}

/** Solid for most of its life, then fading out. */
export function damageAlpha(d: DamageNumber): number {
  const t = d.age / DAMAGE_LIFE;
  return d.fade * (t < 0.6 ? 1 : Math.max(0, (1 - t) / 0.4));
}

/** Half-width and height of the box over the hero that numbers fade inside, world units. */
export const HERO_CLEAR_W = 75;
export const HERO_CLEAR_H = 150;
const HERO_CLEAR_ALPHA = 0.3;

/**
 * Alpha factor for a number at (x, y) against the hero standing at (hx, hy): numbers over
 * his figure fade so they never hide him, easing back to solid within a margin around it.
 */
export function heroClear(x: number, y: number, hx: number, hy: number): number {
  const margin = 30;
  const ox = Math.abs(x - hx) - HERO_CLEAR_W;
  const oy = Math.max(y - hy, hy - HERO_CLEAR_H - y);
  const out = Math.max(ox, oy);
  if (out >= margin) return 1;
  if (out <= 0) return HERO_CLEAR_ALPHA;
  return HERO_CLEAR_ALPHA + ((1 - HERO_CLEAR_ALPHA) * out) / margin;
}
