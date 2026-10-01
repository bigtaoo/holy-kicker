// Floating damage numbers: pure motion and digit layout in a flat pool (swap-remove),
// drawn by damageView.ts as one particle per digit. Expired numbers are recycled.

export interface DamageNumber {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  /** Decimal digits, most significant first. */
  digits: number[];
  crit: boolean;
}

export const DAMAGE_LIFE = 0.75;
const POP_TIME = 0.12;
const RISE = 520;
/** Velocity kept per second. */
const DRAG = 0.03;
const CRIT_SCALE = 1.5;

export class DamagePool {
  readonly live: DamageNumber[] = [];
  private readonly free: DamageNumber[] = [];

  constructor(
    /** Numbers on screen at once; the quality level lowers it. */
    public max: number,
    private readonly rand: () => number = Math.random,
  ) {}

  prewarm(n: number): void {
    while (this.free.length + this.live.length < n) this.free.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, digits: [], crit: false });
  }

  spawn(x: number, y: number, value: number, crit: boolean): void {
    if (this.live.length >= this.max) return;
    const r = this.rand;
    const d = this.free.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, age: 0, digits: [], crit: false };
    d.x = x + (r() - 0.5) * 30;
    d.y = y;
    d.vx = (r() - 0.5) * 160;
    d.vy = -RISE * (crit ? 1.2 : 1);
    d.age = 0;
    d.crit = crit;
    digitsOf(value, d.digits);
    this.live.push(d);
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
  return (d.crit ? CRIT_SCALE : 1) * (t < 1 ? 1.8 - 0.8 * t : 1);
}

/** Solid for most of its life, then fading out. */
export function damageAlpha(d: DamageNumber): number {
  const t = d.age / DAMAGE_LIFE;
  return t < 0.6 ? 1 : Math.max(0, (1 - t) / 0.4);
}
