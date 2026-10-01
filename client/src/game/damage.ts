// Floating damage numbers: pure motion and digit layout in a flat pool (swap-remove),
// drawn by damageView.ts as one particle per digit.

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

  constructor(
    readonly max: number,
    private readonly rand: () => number = Math.random,
  ) {}

  spawn(x: number, y: number, value: number, crit: boolean): void {
    if (this.live.length >= this.max) return;
    const r = this.rand;
    this.live.push({
      x: x + (r() - 0.5) * 30, y, vx: (r() - 0.5) * 160, vy: -RISE * (crit ? 1.2 : 1),
      age: 0, digits: digitsOf(value), crit,
    });
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
        continue;
      }
      d.vx *= k;
      d.vy *= k;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
  }
}

export function digitsOf(value: number): number[] {
  return Array.from(String(Math.max(0, Math.round(value))), (c) => c.charCodeAt(0) - 48);
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
