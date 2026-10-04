import { Graphics, type Container } from 'pixi.js';
import { CASTER, EMERGE, FP, HORDE, SHOOTER, TICK_RATE, rising, underground, type Mob, type MobKind } from '@hk/engine';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import { depthShade } from './mobAnim';
import { MobView, type MobLook } from './mobView';
import { SHADOW_Z } from './shadow';

// Draws the horde: one MobView per sim mob, made when the mob joins (a mob keeps its kind for
// the run), plus chapter 2's tells. A water ghost under the ground is hidden; on its last
// stretch down there its mark shows on the ground (rings in the enemy-attack violet rippling
// in, the disc filling as it nears), and it rises with a splash. A toad about to spit swells.
// Chapter 3: an ice wraith swells as it raises its arms (its frost circle is the threat
// layer's), a mob a howl drives runs its cycle fast and kicks up snow, and a fallen skeleton
// or shard lies hidden under the ground until the witch calls it up again. Chapter 4: a paper
// effigy tears into flying scraps of paper as it falls (its scraps are small effigies).

/** In-world height by mob kind. */
export const MOB_HEIGHT: Record<MobKind, number> = {
  chaser: 80, runner: 76, swarm: 62, emerger: 84, shooter: 66, wolf: 70, caster: 90, skeleton: 84, shard: 50, effigy: 86, scrap: 48, monk: 84,
};
/** World units per second, for the jiangshi's hop pacing. */
const MOB_WALK = (HORDE.speed * TICK_RATE) / FP;
const FOX_TINT = 0xc8a8ff;
const VIOLET = 0xb04cff;
const OUTLINE = 0x140c18;
const SPLASH = 0x9fe0e6;
/** How much a toad swells at the end of its wind-up. */
const SWELL = 0.22;
/** An ice wraith's swell at the end of its wind-up. */
const CAST_SWELL = 0.15;
/** A hasted mob's cycle runs this much faster, and kicks up this many snow puffs a second. */
const HASTE_CYCLE = 1.7;
const HASTE_PUFFS = 5;
const SNOW = 0xc8d4ec;
const PAPER = 0xc4ccdc;

export interface HordeOptions {
  calm: boolean;
  settle: boolean;
  sway: boolean;
  foxTint: boolean;
}

export class HordeView {
  private readonly mobs: MobView[] = [];
  private readonly marks = new Graphics();

  constructor(
    private readonly world: Container,
    private readonly looks: Record<MobKind, MobLook[]>,
    private readonly opts: HordeOptions,
    private readonly fx: FxPool,
  ) {
    // on the ground with the shadows, so the horde stands on it
    this.marks.zIndex = SHADOW_Z + 0.5;
    world.addChild(this.marks);
  }

  /** The view of mob i, if it has one yet. */
  at(i: number): MobView | undefined {
    return this.mobs[i];
  }

  /** A water ghost rose at (x, y), world units. */
  emerge(x: number, y: number): void {
    const r = EMERGE.grab / FP;
    this.fx.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.3, size0: r * 0.6, size1: r * 2, rotation: 0, spin: 0, drag: 1, color: SPLASH, alpha: 0.9, aspect: 0.45 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.random() * 0.5;
      const v = 160 + Math.random() * 120;
      this.fx.emit({
        shape: 'puff', x, y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 140, life: 0.35, size0: 14, size1: 4,
        rotation: 0, spin: 0, drag: 0.05, color: SPLASH, alpha: 0.95,
      });
    }
  }

  draw(mobs: readonly Mob[], alpha: number, dt: number, hx: number, hy: number): void {
    while (this.mobs.length < mobs.length) {
      const m = mobs[this.mobs.length];
      const looks = this.looks[m.kind];
      const v = new MobView(looks[this.mobs.length % looks.length], this.world, this.opts.calm);
      // a multiply tint is free: it turns the pale fox lavender, away from the teal jiangshi
      if (this.opts.foxTint && m.kind === 'runner') v.tint(FOX_TINT);
      const tint = looks[this.mobs.length % looks.length].tint;
      if (tint !== undefined) v.tint(tint);
      this.mobs.push(v);
    }
    const g = this.marks.clear();
    for (let i = 0; i < this.mobs.length; i++) {
      const m = mobs[i];
      const v = this.mobs[i];
      const x = lerpX(m, alpha);
      const y = lerpY(m, alpha);
      const hidden = underground(m);
      v.setVisible(!hidden);
      if (hidden) {
        if (rising(m, EMERGE.warn)) this.mark(g, x, y, 1 - (m.t - alpha) / EMERGE.warn);
        continue;
      }
      // a toad swells over its wind-up, an ice wraith over its cast
      v.swell = m.stun > 0 ? 0
        : m.kind === 'shooter' && m.t <= SHOOTER.windup ? SWELL * (1 - (m.t - alpha) / SHOOTER.windup)
        : m.kind === 'caster' && m.t <= CASTER.windup ? CAST_SWELL * (1 - (m.t - alpha) / CASTER.windup)
        : 0;
      if (m.haste > 0 && m.stun === 0 && Math.random() < dt * HASTE_PUFFS) this.kick(x, y);
      // a stunned mob (the Stunning Bell) freezes mid-pose
      const walk = this.opts.settle && m.kind === 'chaser' ? MOB_WALK : 0;
      v.update(dt, x, y, hx - x, m.stun > 0 ? 0 : m.haste > 0 ? HASTE_CYCLE : 1, walk, this.opts.sway);
      if (this.opts.calm) v.shade(depthShade(Math.hypot(x - hx, y - hy)));
    }
  }

  /** A paper effigy tore at (x, y), world units: scraps of paper flutter off. */
  tear(x: number, y: number): void {
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI * (0.15 + 0.7 * Math.random());
      const v = 140 + Math.random() * 160;
      this.fx.emit({
        shape: 'spark', x, y: y - 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, size0: 18, size1: 8,
        rotation: Math.random() * Math.PI, spin: 8, drag: 0.08, color: k % 3 ? PAPER : VIOLET, alpha: 0.95,
      });
    }
  }

  /** A puff of snow kicked up behind a running mob. */
  private kick(x: number, y: number): void {
    this.fx.emit({
      shape: 'puff', x: x + (Math.random() - 0.5) * 30, y: y - 6, vx: (Math.random() - 0.5) * 60, vy: -50, life: 0.35, size0: 14, size1: 4,
      rotation: 0, spin: 0, drag: 0.1, color: SNOW, alpha: 0.8,
    });
  }

  /** A water ghost's mark, `k` (0..1) of the way to its rising. */
  private mark(g: Graphics, x: number, y: number, k: number): void {
    const r = EMERGE.grab / FP;
    k = Math.max(0, Math.min(1, k));
    // flattened like the shadows: it lies on the ground
    const flat = 0.45;
    g.ellipse(x, y, r, r * flat).fill({ color: VIOLET, alpha: 0.12 + 0.18 * k });
    g.ellipse(x, y, r * k, r * k * flat).fill({ color: VIOLET, alpha: 0.28 });
    g.ellipse(x, y, r, r * flat).stroke({ color: OUTLINE, width: 7, alpha: 0.5 }).ellipse(x, y, r, r * flat).stroke({ color: VIOLET, width: 4 });
    // ripples running in to the middle
    for (let j = 0; j < 2; j++) {
      const q = 1 - ((k * 2 + j * 0.5) % 1);
      g.ellipse(x, y, r * q, r * q * flat).stroke({ color: SPLASH, width: 3, alpha: 0.7 * (1 - q) + 0.2 });
    }
  }
}
