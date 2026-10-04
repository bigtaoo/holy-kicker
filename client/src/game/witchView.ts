import { Container, Sprite, type Renderer, type Texture } from 'pixi.js';
import { FP, JUDGE, TICK_RATE, WITCH, type Boss as BossState } from '@hk/engine';
import { t, type Key } from '../i18n';
import { BossBar } from './bossBar';
import { DarkAura } from './darkAura';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import type { MobSheet } from './mobView';
import { makeShadow } from './shadow';

// The bosses that cast from a staff, drawn from the sim's boss: the Bone Witch (systems/witch.ts)
// and the Underworld Judge (systems/judge.ts) with his brush. The baked sheet glides after the
// hero at its distance, rises tall with motes gathering at the staff's tip while it winds up,
// and a burst comes off the tip when it brings it down. The witch's skeletons are horde mobs;
// the game puffs dust where each one is called up (summonFx), and the judge's verdicts are
// zones the threat layer draws. Empowered (a later chapter's mid-boss) the boss is tinted and
// wrapped in the abbot's dark aura; the judge below half his health throbs a deeper violet.
// Same surface as the abbot's and the carp's views, so the game drives them through BossStage.

const VIOLET = 0xb04cff;
const HURT_TINT_TIME = 0.15;
const FADE = 0.5;

export interface StaffBossStyle {
  /** The bar's string keys, plain and empowered. */
  name: Key;
  empoweredName: Key;
  /** Ticks of the wind-up. */
  windup: number;
  /** How much it rises over the wind-up. */
  swell: number;
  /** The staff's tip, as a share of its height: from its middle toward where it faces, up. */
  staff: [number, number];
  /** The motes and the burst, and the sparks mixed into the burst. */
  glow: number;
  spark: number;
}

export const WITCH_STYLE: StaffBossStyle = {
  name: 'boss.witch', empoweredName: 'boss.witchEmpowered', windup: WITCH.windup, swell: 0.12, staff: [0.3, 0.85], glow: VIOLET, spark: 0xd8dce8,
};

export const JUDGE_STYLE: StaffBossStyle = {
  name: 'boss.judge', empoweredName: 'boss.judge', windup: JUDGE.windup, swell: 0.08, staff: [0.43, 0.87], glow: VIOLET, spark: 0x2a2440,
};

/** The empowered boss's multiply tint, and the enraged judge's at the top of its throb. */
const EMPOWERED_TINT = 0xb8a0e8;
const RAGE_TINT = 0xc890f0;

export class StaffBossView {
  readonly view = new Container();
  private readonly bar: BossBar;
  readonly hud: Container;
  private readonly sprite: Sprite;
  private readonly shadow: Sprite;
  private readonly scale: number;
  private aura: DarkAura | null = null;
  private facing = -1;
  private tint = 0;
  private time = 0;
  private glow = 0;

  constructor(
    private readonly renderer: Renderer, private readonly sheet: MobSheet, world: Container, shadowTex: Texture, readonly height: number,
    private readonly fx: FxPool, private readonly style: StaffBossStyle,
  ) {
    this.bar = new BossBar(t(style.name));
    this.hud = this.bar.view;
    const m = sheet.meta;
    this.sprite = new Sprite(sheet.textures[0]);
    this.sprite.anchor.set(m.anchor[0] / m.frameW, m.anchor[1] / m.frameH);
    this.scale = height / m.height;
    this.view.addChild(this.sprite);
    this.shadow = makeShadow(shadowTex, height * 0.28, height * 0.07);
    world.addChild(this.shadow, this.view);
  }

  draw(b: BossState, alpha: number, dt: number, hx: number): void {
    const x = lerpX(b, alpha);
    const y = lerpY(b, alpha);
    this.view.alpha = b.phase === 'down' ? Math.max(0, 1 - (b.t + alpha) / TICK_RATE / FADE) : 1;
    this.shadow.visible = this.view.alpha > 0;
    if (b.phase === 'walk' && Math.abs(hx - x) > 30) this.facing = hx < x ? -1 : 1;
    const m = this.sheet.meta;
    // it slows and sways in place while winding up
    this.time += dt * (b.phase === 'windup' ? 0.4 : 1);
    const frame = Math.floor(this.time * m.fps) % m.frames;
    if (this.tint > 0) this.tint = Math.max(0, this.tint - dt);
    this.sprite.texture = this.sheet.textures[frame + (this.tint > 0 ? m.flash : 0)];
    const k = b.phase === 'windup' ? Math.min(1, (b.t + alpha) / this.style.windup) : 0;
    const s = this.scale * (1 + this.style.swell * k);
    this.sprite.scale.set(-this.facing * s, s);
    this.sprite.tint = b.empowered ? EMPOWERED_TINT : b.kind === 'judge' && b.hp * 100 <= b.maxHp * JUDGE.ragePercent ? rage(this.time) : 0xffffff;
    if (b.empowered && !this.aura) {
      this.aura = new DarkAura(this.renderer, this.height);
      this.view.addChildAt(this.aura.view, 0);
    }
    this.aura?.update(dt);
    this.view.position.set(x, y);
    this.shadow.position.set(x, y);
    if (k > 0) this.gather(x, y, k, dt);
    this.bar.rename(t(b.empowered ? this.style.empoweredName : this.style.name));
    this.bar.set(b.hp, b.maxHp);
  }

  show(on: boolean): void {
    this.view.visible = this.shadow.visible = this.hud.visible = on;
  }

  windup(_b: BossState): void {
    this.glow = 0;
  }

  hit(_b: BossState): number {
    this.tint = HURT_TINT_TIME;
    return this.height;
  }

  /** It brought its staff down at (x, y), world units: a ring and a burst of sparks. */
  cast(x: number, y: number): void {
    const [sx, sy] = this.staff(x, y);
    const { glow, spark } = this.style;
    this.fx.emit({ shape: 'ring', x: sx, y: sy, vx: 0, vy: 0, life: 0.3, size0: 40, size1: 220, rotation: 0, spin: 0, drag: 1, color: glow, alpha: 0.9 });
    this.fx.emit({ shape: 'glow', x: sx, y: sy, vx: 0, vy: 0, life: 0.25, size0: 160, size1: 60, rotation: 0, spin: 0, drag: 1, color: glow, alpha: 0.7 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const v = 220 + Math.random() * 160;
      this.fx.emit({
        shape: 'spark', x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, size0: 22, size1: 4,
        rotation: Math.random() * Math.PI, spin: 6, drag: 0.05, color: i % 2 ? spark : glow, alpha: 1,
      });
    }
  }

  impact(_x: number, _y: number, _r: number): void {}

  down(b: BossState): void {
    for (let i = 0; i < 6; i++) this.fx.puff(b.x / FP + (i - 2.5) * 40, b.y / FP - (i % 2) * 60);
  }

  back(): void {}

  layout(playW: number, scale: number): void {
    this.bar.layout(playW, scale);
  }

  /** Where the staff's tip is with its feet at (x, y). */
  private staff(x: number, y: number): [number, number] {
    const [fx, fy] = this.style.staff;
    return [x + fx * this.height * this.facing, y - fy * this.height];
  }

  /** Motes drawn in to its staff while it winds up, `k` (0..1) of the way. */
  private gather(x: number, y: number, k: number, dt: number): void {
    this.glow += dt * (6 + 18 * k);
    const [sx, sy] = this.staff(x, y);
    while (this.glow >= 1) {
      this.glow -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = 120 + Math.random() * 60;
      this.fx.emit({
        shape: 'glow', x: sx + Math.cos(a) * r, y: sy + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.6, vy: -Math.sin(a) * r * 2.6, life: 0.35,
        size0: 26, size1: 8, rotation: 0, spin: 0, drag: 1, color: this.style.glow, alpha: 0.9,
      });
    }
  }
}

/** The enraged judge's throb: white to RAGE_TINT and back, about once a second. */
function rage(time: number): number {
  const k = 0.5 + 0.5 * Math.sin(time * 6);
  const lerp = (sh: number) => {
    const a = 0xff;
    const b = (RAGE_TINT >> sh) & 0xff;
    return Math.round(a + (b - a) * k) << sh;
  };
  return lerp(16) | lerp(8) | lerp(0);
}

/** A skeleton called up out of the ground at (x, y), world units: dust and a cold ring. */
export function summonFx(fx: FxPool, x: number, y: number): void {
  fx.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.35, size0: 30, size1: 130, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.85, aspect: 0.45 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.random() * 0.5;
    const v = 120 + Math.random() * 100;
    fx.emit({
      shape: 'puff', x, y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.4 - 120, life: 0.4, size0: 18, size1: 5,
      rotation: 0, spin: 0, drag: 0.05, color: 0xd8dce8, alpha: 0.8,
    });
  }
}
