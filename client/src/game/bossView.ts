import { Container, Sprite, type Renderer, type Texture } from 'pixi.js';
import { BOSS, FP, TICK_RATE, type Boss as BossState } from '@hk/engine';
import { t } from '../i18n';
import { BossBar } from './bossBar';
import { DarkAura } from './darkAura';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import { makeShadow } from './shadow';
import { TaoActor, type TaoAsset } from './tao/TaoActor';
import { ZONE_TOP_Z, zoneTextures } from './threatView';

// The boss on screen, drawn from the sim's boss: the cutout rig (walk / slam / hurt), its slam
// warning in the enemy attack violet, the impact, and a health bar across the top of the play
// area. Its behaviour lives in the engine (systems/boss.ts); events start the clips. Empowered
// (the later chapters' mid-boss) it is tinted a dusky violet, wrapped in a dark aura (darkAura.ts)
// and its bar says so.

const VIOLET = 0xb04cff;
const ZONE_TEX = 128;
const HURT_TINT_TIME = 0.15;
/** The empowered boss's multiply tint. */
const EMPOWERED_TINT = 0xb8a0e8;
/** Seconds it takes to fade out once defeated. */
const FADE = 0.5;

export class Boss {
  readonly view = new Container();
  private readonly bar = new BossBar(t('boss.abbot'));
  /** Screen-space bar, placed by the game in play-area units. */
  readonly hud = this.bar.view;
  private readonly actor: TaoActor;
  private readonly body = new Container();
  private readonly shadow: Sprite;
  private readonly zone: [Sprite, Sprite];
  private aura: DarkAura | null = null;
  private facing = -1;
  private tint = 0;

  constructor(
    private readonly renderer: Renderer,
    world: Container,
    asset: TaoAsset,
    shadowTex: Texture,
    readonly height: number,
    private readonly fx: FxPool,
  ) {
    this.actor = new TaoActor(asset);
    this.actor.view.scale.set(height / this.actor.height);
    this.actor.play('walk');
    this.body.addChild(this.actor.view);
    this.view.addChild(this.body);
    this.shadow = makeShadow(shadowTex, height * 0.42, height * 0.11);
    const [outer, inner] = zoneTextures(renderer, VIOLET, 'fill');
    this.zone = [new Sprite(outer), new Sprite(inner)];
    for (const s of this.zone) {
      s.anchor.set(0.5);
      s.zIndex = ZONE_TOP_Z;
      s.visible = false;
    }
    world.addChild(this.shadow, this.view, ...this.zone);
  }

  /** Draws the sim's boss, `alpha` of the way through the last tick; hx is the hero's x. */
  draw(b: BossState, alpha: number, dt: number, hx: number): void {
    const x = lerpX(b, alpha);
    const y = lerpY(b, alpha);
    if (b.phase === 'down') {
      this.view.alpha = Math.max(0, 1 - (b.t + alpha) / TICK_RATE / FADE);
      this.shadow.visible = this.view.alpha > 0;
    } else {
      this.view.alpha = 1;
      this.shadow.visible = true;
    }
    if (b.phase === 'walk') {
      if (Math.abs(hx - x) > 30) this.facing = hx < x ? -1 : 1;
      if (this.actor.current !== 'hurt' || this.actor.finished) this.actor.play('walk');
    }
    // drawn facing left; mirror to face right
    this.body.scale.x = -this.facing;
    this.actor.update(dt);
    if (b.empowered && !this.aura) {
      this.aura = new DarkAura(this.renderer, this.height);
      this.view.addChildAt(this.aura.view, 0);
    }
    this.aura?.update(dt);
    this.view.position.set(x, y);
    this.shadow.position.set(x, y);
    if (this.tint > 0) this.tint = Math.max(0, this.tint - dt);
    this.actor.view.tint = flash(this.tint / HURT_TINT_TIME, b.empowered ? EMPOWERED_TINT : 0xffffff);
    this.drawZone(b, alpha);
    this.bar.rename(t(b.empowered ? 'boss.empowered' : 'boss.abbot'));
    this.bar.set(b.hp, b.maxHp);
  }

  /** Shows or hides the boss and its bar (in a chapter it is only there on its waves). */
  show(on: boolean): void {
    this.view.visible = this.shadow.visible = this.hud.visible = on;
    if (!on) this.zone[0].visible = this.zone[1].visible = false;
  }

  /** The sim started a slam: raise the fists, facing the circle. */
  windup(b: BossState): void {
    this.actor.play('slam', true);
    if (b.zoneX !== b.x) this.facing = b.zoneX < b.x ? -1 : 1;
  }

  /** A ball or spell hit. Returns the height to show the damage number at. */
  hit(b: BossState): number {
    this.tint = HURT_TINT_TIME;
    // the slam is not interrupted: a boss that flinches out of every attack never threatens
    if (b.phase === 'walk') this.actor.play('hurt', true);
    return this.height;
  }

  down(b: BossState): void {
    this.zone[0].visible = this.zone[1].visible = false;
    const x = b.x / FP;
    const y = b.y / FP;
    for (let i = 0; i < 6; i++) this.fx.puff(x + (i - 2.5) * 40, y - (i % 2) * 60);
  }

  back(): void {
    this.actor.play('walk', true);
  }

  /** Keeps the bar centred across the top of the play area (play-area pixels and scale). */
  layout(playW: number, scale: number): void {
    this.bar.layout(playW, scale);
  }

  private drawZone(b: BossState, alpha: number): void {
    const [outer, inner] = this.zone;
    outer.visible = inner.visible = b.phase === 'windup';
    if (!outer.visible) return;
    const t = Math.min(1, (b.t + alpha) / BOSS.windup);
    const k = (BOSS.slamRadius * 2) / FP / (ZONE_TEX - 8);
    outer.position.set(b.zoneX / FP, b.zoneY / FP);
    inner.position.set(b.zoneX / FP, b.zoneY / FP);
    outer.scale.set(k * Math.min(1, 0.6 + ((b.t + alpha) / TICK_RATE) * 4));
    inner.scale.set(k * t);
  }

  /** The slam lands at (x, y), world units. */
  impact(x: number, y: number, r: number): void {
    this.fx.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.3, size0: r, size1: r * 2.4, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.9 });
    this.fx.emit({ shape: 'glow', x, y, vx: 0, vy: 0, life: 0.22, size0: r * 2, size1: r * 2.2, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.5 });
    // dust kicked up around the rim
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.fx.puff(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
    }
  }
}

/** `base` at 0; a pale cold flash at 1 (no warm tint on enemies). */
function flash(k: number, base: number): number {
  const ch = (shift: number, to: number) => {
    const c = (base >> shift) & 0xff;
    return Math.round(c + (to - c) * k);
  };
  return (ch(16, 195) << 16) | (ch(8, 195) << 8) | ch(0, 255);
}
