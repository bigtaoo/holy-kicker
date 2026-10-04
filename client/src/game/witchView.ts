import { Container, Sprite, type Texture } from 'pixi.js';
import { FP, TICK_RATE, WITCH, type Boss as BossState } from '@hk/engine';
import { t } from '../i18n';
import { BossBar } from './bossBar';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import type { MobSheet } from './mobView';
import { makeShadow } from './shadow';

// The Bone Witch on screen, drawn from the sim's boss (systems/witch.ts): the baked witch
// gliding after the hero at her distance, rising tall with a cold glow gathering at her staff's
// skull while she winds up, and a burst of bone dust when she brings it down. Her skeletons
// are horde mobs; the game puffs dust where each one is called up (summonFx). Same surface as
// the abbot's and the carp's views, so the game drives her through BossStage.

const VIOLET = 0xb04cff;
const BONE = 0xd8dce8;
const HURT_TINT_TIME = 0.15;
const FADE = 0.5;
/** How much she rises over her wind-up. */
const SWELL = 0.12;
/** The staff's skull, as a share of her height: left of her middle (she faces left), near the top. */
const STAFF: [number, number] = [-0.3, -0.85];

export class WitchView {
  readonly view = new Container();
  private readonly bar = new BossBar(t('boss.witch'));
  readonly hud = this.bar.view;
  private readonly sprite: Sprite;
  private readonly shadow: Sprite;
  private readonly scale: number;
  private facing = -1;
  private tint = 0;
  private time = 0;
  private glow = 0;

  constructor(private readonly sheet: MobSheet, world: Container, shadowTex: Texture, readonly height: number, private readonly fx: FxPool) {
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
    // she slows and sways in place while winding up
    this.time += dt * (b.phase === 'windup' ? 0.4 : 1);
    const frame = Math.floor(this.time * m.fps) % m.frames;
    if (this.tint > 0) this.tint = Math.max(0, this.tint - dt);
    this.sprite.texture = this.sheet.textures[frame + (this.tint > 0 ? m.flash : 0)];
    const k = b.phase === 'windup' ? Math.min(1, (b.t + alpha) / WITCH.windup) : 0;
    const s = this.scale * (1 + SWELL * k);
    this.sprite.scale.set(-this.facing * s, s);
    this.view.position.set(x, y);
    this.shadow.position.set(x, y);
    if (k > 0) this.gather(x, y, k, dt);
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

  /** She brought her staff down at (x, y), world units: a ring and a burst of bone dust. */
  cast(x: number, y: number): void {
    const [sx, sy] = this.staff(x, y);
    this.fx.emit({ shape: 'ring', x: sx, y: sy, vx: 0, vy: 0, life: 0.3, size0: 40, size1: 220, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.9 });
    this.fx.emit({ shape: 'glow', x: sx, y: sy, vx: 0, vy: 0, life: 0.25, size0: 160, size1: 60, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.7 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const v = 220 + Math.random() * 160;
      this.fx.emit({
        shape: 'spark', x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, size0: 22, size1: 4,
        rotation: Math.random() * Math.PI, spin: 6, drag: 0.05, color: i % 2 ? BONE : VIOLET, alpha: 1,
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

  /** Where the staff's skull is with her feet at (x, y). */
  private staff(x: number, y: number): [number, number] {
    return [x - STAFF[0] * this.height * this.facing, y + STAFF[1] * this.height];
  }

  /** Cold motes drawn in to her staff while she winds up, `k` (0..1) of the way. */
  private gather(x: number, y: number, k: number, dt: number): void {
    this.glow += dt * (6 + 18 * k);
    const [sx, sy] = this.staff(x, y);
    while (this.glow >= 1) {
      this.glow -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = 120 + Math.random() * 60;
      this.fx.emit({
        shape: 'glow', x: sx + Math.cos(a) * r, y: sy + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.6, vy: -Math.sin(a) * r * 2.6, life: 0.35,
        size0: 26, size1: 8, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.9,
      });
    }
  }
}

/** A skeleton called up out of the ground at (x, y), world units: dust and a cold ring. */
export function summonFx(fx: FxPool, x: number, y: number): void {
  fx.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.35, size0: 30, size1: 130, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.85, aspect: 0.45 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.random() * 0.5;
    const v = 120 + Math.random() * 100;
    fx.emit({
      shape: 'puff', x, y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.4 - 120, life: 0.4, size0: 18, size1: 5,
      rotation: 0, spin: 0, drag: 0.05, color: BONE, alpha: 0.8,
    });
  }
}
