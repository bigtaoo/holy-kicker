import type { Mob } from './horde';

// Enemy attacks for the readability test: bullets fired from the horde at the hero, and
// ground zones that warn first and then blast. Pure state, drawn by threatView.ts.
//
// The point is not balance but whether the player can still read what will hurt him once a
// crowd, spells and gems fill the screen, so shooters are simply mobs picked at random among
// the ones near the hero.

/** Looks compared for readability, chosen in the scene options. */
export type BulletLook = 'red' | 'violet' | 'ink';
export const BULLET_LOOKS: readonly BulletLook[] = ['red', 'violet', 'ink'];
export type ZoneLook = 'fill' | 'edge';
export type ZoneLayer = 'under' | 'over' | 'top';

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

export interface Zone {
  x: number;
  y: number;
  radius: number;
  /** Seconds since it appeared; it blasts at `warn`. */
  age: number;
}

export interface ThreatParams {
  /** Volleys a second, and bullets per volley (a fan). */
  rate: number;
  fan: number;
  bulletSpeed: number;
  bulletLife: number;
  /** Hero hit radius for bullets. */
  hitRadius: number;
  /** Only mobs this close to the hero shoot. */
  range: number;
  /** Zones a second, their radius, warning time, and how far from the hero they land. */
  zoneRate: number;
  zoneRadius: number;
  warn: number;
  zoneSpread: number;
}

export const THREATS: ThreatParams = {
  rate: 1.5, fan: 3, bulletSpeed: 380, bulletLife: 4, hitRadius: 40, range: 900,
  zoneRate: 0.7, zoneRadius: 170, warn: 1.2, zoneSpread: 350,
};

const FAN_STEP = 0.22;
/** Tries to find a shooter among random mobs before skipping a volley. */
const PICKS = 8;

export class ThreatField {
  readonly bullets: Bullet[] = [];
  readonly zones: Zone[] = [];
  /** Zones that blasted during the last step, for the blast effect. */
  readonly blasts: Zone[] = [];
  /** Hits on the hero during the last step. */
  hits = 0;
  private volley = 0;
  private zoneTimer = 0;
  private readonly freeBullets: Bullet[] = [];
  private readonly freeZones: Zone[] = [];

  constructor(
    readonly params: ThreatParams = THREATS,
    private readonly rand: () => number = Math.random,
  ) {}

  step(dt: number, hx: number, hy: number, mobs: readonly Mob[]): void {
    const p = this.params;
    this.hits = 0;
    this.freeZones.push(...this.blasts);
    this.blasts.length = 0;
    if (p.rate > 0) {
      this.volley -= dt;
      if (this.volley <= 0) {
        this.volley += 1 / p.rate;
        this.fire(hx, hy, mobs);
      }
    }
    if (p.zoneRate > 0) {
      this.zoneTimer -= dt;
      if (this.zoneTimer <= 0) {
        this.zoneTimer += 1 / p.zoneRate;
        this.place(hx, hy);
      }
    }

    const hit2 = p.hitRadius * p.hitRadius;
    const bs = this.bullets;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const hit = (b.x - hx) ** 2 + (b.y - hy) ** 2 < hit2;
      if (hit) this.hits++;
      if (hit || b.age >= p.bulletLife) {
        bs[i] = bs[bs.length - 1];
        bs.pop();
        this.freeBullets.push(b);
      }
    }

    const zs = this.zones;
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i];
      z.age += dt;
      if (z.age < p.warn) continue;
      if ((z.x - hx) ** 2 + (z.y - hy) ** 2 < z.radius * z.radius) this.hits++;
      this.blasts.push(z);
      zs[i] = zs[zs.length - 1];
      zs.pop();
    }
  }

  /** A fan of bullets from a random mob in range, aimed at the hero. */
  private fire(hx: number, hy: number, mobs: readonly Mob[]): void {
    const p = this.params;
    if (mobs.length === 0) return;
    for (let k = 0; k < PICKS; k++) {
      const m = mobs[Math.floor(this.rand() * mobs.length)];
      const d = Math.hypot(hx - m.x, hy - m.y);
      if (d > p.range || d < 1) continue;
      const aim = Math.atan2(hy - m.y, hx - m.x);
      for (let i = 0; i < p.fan; i++) {
        const a = aim + (i - (p.fan - 1) / 2) * FAN_STEP;
        const b = this.freeBullets.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, age: 0 };
        b.x = m.x;
        b.y = m.y;
        b.vx = Math.cos(a) * p.bulletSpeed;
        b.vy = Math.sin(a) * p.bulletSpeed;
        b.age = 0;
        this.bullets.push(b);
      }
      return;
    }
  }

  /** A zone near the hero, often right on his path. */
  private place(hx: number, hy: number): void {
    const p = this.params;
    const a = this.rand() * Math.PI * 2;
    const r = this.rand() * p.zoneSpread;
    const z = this.freeZones.pop() ?? { x: 0, y: 0, radius: 0, age: 0 };
    z.x = hx + Math.cos(a) * r;
    z.y = hy + Math.sin(a) * r;
    z.radius = p.zoneRadius;
    z.age = 0;
    this.zones.push(z);
  }
}
