import { Container, Graphics, Sprite, type Renderer, type Texture } from 'pixi.js';
import { CARP, FP, TICK_RATE, type Boss as BossState } from '@hk/engine';
import { t } from '../i18n';
import { BossBar } from './bossBar';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import type { MobSheet } from './mobView';
import { SHADOW_Z, makeShadow } from './shadow';
import { ZONE_TOP_Z, zoneTextures } from './threatView';

// The Black Carp King on screen, drawn from the sim's boss (systems/carp.ts): the baked carp
// waddling on its stubby feet, its wake while it swims under water (a dark shape and a fin
// cutting the surface, rippling), its locked circle in the enemy attack violet filling as it
// rises, and the splash when it surfaces. Same surface as the abbot's view (bossView.ts), so
// the game drives either through BossStage.

const VIOLET = 0xb04cff;
const SPLASH = 0x9fe0e6;
const OUTLINE = 0x140c18;
const ZONE_TEX = 128;
const HURT_TINT_TIME = 0.15;
const FADE = 0.5;
/** Seconds it takes to come up out of the water after surfacing. */
const POP = 0.25;

export class CarpView {
  readonly view = new Container();
  private readonly bar = new BossBar(t('boss.carp'));
  readonly hud = this.bar.view;
  private readonly sprite: Sprite;
  private readonly shadow: Sprite;
  private readonly wake = new Graphics();
  private readonly zone: [Sprite, Sprite];
  private readonly scale: number;
  private facing = -1;
  private tint = 0;
  private time = 0;
  /** Seconds since it surfaced (it rises out of the water over POP). */
  private popped = POP;

  constructor(renderer: Renderer, private readonly sheet: MobSheet, world: Container, shadowTex: Texture, readonly height: number, private readonly fx: FxPool) {
    const m = this.sheet.meta;
    this.sprite = new Sprite(this.sheet.textures[0]);
    this.sprite.anchor.set(m.anchor[0] / m.frameW, m.anchor[1] / m.frameH);
    this.scale = height / m.height;
    this.view.addChild(this.sprite);
    this.shadow = makeShadow(shadowTex, height * 0.36, height * 0.09);
    this.wake.zIndex = SHADOW_Z + 0.5;
    const [outer, inner] = zoneTextures(renderer, VIOLET, 'fill');
    this.zone = [new Sprite(outer), new Sprite(inner)];
    for (const s of this.zone) {
      s.anchor.set(0.5);
      s.zIndex = ZONE_TOP_Z;
      s.visible = false;
    }
    world.addChild(this.shadow, this.wake, this.view, ...this.zone);
  }

  draw(b: BossState, alpha: number, dt: number, hx: number): void {
    const x = lerpX(b, alpha);
    const y = lerpY(b, alpha);
    const under = b.phase === 'dive' || b.phase === 'rise';
    this.time += dt;
    this.popped += dt;
    this.view.alpha = b.phase === 'down' ? Math.max(0, 1 - (b.t + alpha) / TICK_RATE / FADE) : 1;
    this.view.visible = !under;
    this.shadow.visible = !under && this.view.alpha > 0;
    if (b.phase === 'walk' && Math.abs(hx - x) > 30) this.facing = hx < x ? -1 : 1;
    const m = this.sheet.meta;
    this.sprite.texture = this.sheet.textures[Math.floor(this.time * m.fps) % m.frames];
    const rise = Math.min(1, this.popped / POP);
    this.sprite.scale.set(-this.facing * this.scale, this.scale * (0.55 + 0.45 * rise));
    if (this.tint > 0) this.tint = Math.max(0, this.tint - dt);
    this.sprite.tint = flash(this.tint / HURT_TINT_TIME);
    this.view.position.set(x, y);
    this.shadow.position.set(x, y);
    this.drawWake(under ? x : NaN, y);
    this.drawZone(b, alpha);
    this.bar.set(b.hp, b.maxHp);
  }

  show(on: boolean): void {
    this.view.visible = this.shadow.visible = this.hud.visible = this.wake.visible = on;
    if (!on) this.zone[0].visible = this.zone[1].visible = false;
  }

  /** It dived at (x, y), world units: a splash where it went under. */
  dive(x: number, y: number): void {
    this.splash(x, y, 120);
  }

  /** Its circle locked; the zone shows from the sim state. */
  windup(_b: BossState): void {}

  hit(_b: BossState): number {
    this.tint = HURT_TINT_TIME;
    return this.height;
  }

  down(b: BossState): void {
    this.zone[0].visible = this.zone[1].visible = false;
    for (let i = 0; i < 6; i++) this.fx.puff(b.x / FP + (i - 2.5) * 40, b.y / FP - (i % 2) * 60);
  }

  back(): void {
    this.popped = 0;
  }

  layout(playW: number, scale: number): void {
    this.bar.layout(playW, scale);
  }

  /** It surfaced at (x, y), world units: the shockwave over radius r and a burst of water. */
  impact(x: number, y: number, r: number): void {
    this.popped = 0;
    this.fx.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.3, size0: r, size1: r * 2.4, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.9, aspect: 0.5 });
    this.splash(x, y, r);
  }

  private splash(x: number, y: number, r: number): void {
    this.fx.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.35, size0: r * 0.5, size1: r * 1.8, rotation: 0, spin: 0, drag: 1, color: SPLASH, alpha: 0.9, aspect: 0.45 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.random() * 0.4;
      const v = 200 + Math.random() * 200;
      this.fx.emit({
        shape: 'puff', x, y: y - 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 260, life: 0.45, size0: 22, size1: 6,
        rotation: 0, spin: 0, drag: 0.05, color: SPLASH, alpha: 0.95,
      });
    }
  }

  /** The wake of the carp under water at (x, y), or none for NaN x. */
  private drawWake(x: number, y: number): void {
    const g = this.wake.clear();
    if (Number.isNaN(x)) return;
    const r = this.height * 0.45;
    g.ellipse(x, y, r, r * 0.4).fill({ color: OUTLINE, alpha: 0.35 });
    for (let j = 0; j < 2; j++) {
      const q = (this.time * 1.6 + j * 0.5) % 1;
      g.ellipse(x, y, r * (0.6 + q), r * (0.6 + q) * 0.4).stroke({ color: SPLASH, width: 4, alpha: 0.7 * (1 - q) });
    }
    // the dorsal fin cutting the surface
    const s = this.facing;
    g.poly([x - 26 * s, y, x + 6 * s, y - 46, x + 30 * s, y], true).fill(0x6a55a0).stroke({ color: OUTLINE, width: 5, join: 'round' });
  }

  private drawZone(b: BossState, alpha: number): void {
    const [outer, inner] = this.zone;
    outer.visible = inner.visible = b.phase === 'rise';
    if (!outer.visible) return;
    const k = (CARP.radius * 2) / FP / (ZONE_TEX - 8);
    outer.position.set(b.zoneX / FP, b.zoneY / FP);
    inner.position.set(b.zoneX / FP, b.zoneY / FP);
    outer.scale.set(k * Math.min(1, 0.6 + ((b.t + alpha) / TICK_RATE) * 4));
    inner.scale.set(k * Math.min(1, (b.t + alpha) / CARP.rise));
  }
}

/** White at 0; a pale cold flash at 1. */
function flash(k: number): number {
  const ch = (to: number) => Math.round(255 + (to - 255) * k);
  return (ch(195) << 16) | (ch(195) << 8) | 255;
}
