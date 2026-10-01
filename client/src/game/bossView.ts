import { Container, Sprite, Text, Texture, type Renderer } from 'pixi.js';
import { BOSS, FP, TICK_RATE, type Boss as BossState } from '@hk/engine';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import { makeShadow } from './shadow';
import { TaoActor, type TaoAsset } from './tao/TaoActor';
import { ZONE_TOP_Z, zoneTextures } from './threatView';

// The boss on screen, drawn from the sim's boss: the cutout rig (walk / slam / hurt), its slam
// warning in the enemy attack violet, the impact, and a health bar across the top of the play
// area. Its behaviour lives in the engine (systems/boss.ts); events start the clips.

const VIOLET = 0xb04cff;
const ZONE_TEX = 128;
const HURT_TINT_TIME = 0.15;
/** Seconds it takes to fade out once defeated. */
const FADE = 0.5;
const BAR_W = 760;
const BAR_H = 26;

export class Boss {
  readonly view = new Container();
  /** Screen-space bar, placed by the game in play-area units. */
  readonly hud = new Container();
  private readonly actor: TaoActor;
  private readonly body = new Container();
  private readonly shadow: Sprite;
  private readonly zone: [Sprite, Sprite];
  private readonly barFill = new Sprite(Texture.WHITE);
  private facing = -1;
  private tint = 0;

  constructor(
    renderer: Renderer,
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
    this.buildHud();
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
    this.view.position.set(x, y);
    this.shadow.position.set(x, y);
    if (this.tint > 0) this.tint = Math.max(0, this.tint - dt);
    this.actor.view.tint = flash(this.tint / HURT_TINT_TIME);
    this.drawZone(b, alpha);
    this.barFill.scale.x = (BAR_W * b.hp) / BOSS.hp;
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
    this.hud.scale.set(scale);
    this.hud.position.set(playW / 2, 210 * scale);
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

  private buildHud(): void {
    const back = new Sprite(Texture.WHITE);
    back.tint = 0x140c18;
    back.alpha = 0.75;
    back.width = BAR_W + 12;
    back.height = BAR_H + 12;
    back.position.set(-BAR_W / 2 - 6, -6);
    this.barFill.tint = VIOLET;
    this.barFill.height = BAR_H;
    this.barFill.width = BAR_W;
    this.barFill.x = -BAR_W / 2;
    const name = new Text({
      text: 'Fallen Abbot',
      style: { fill: 0xffffff, fontFamily: 'Arial', fontWeight: 'bold', fontSize: 48, stroke: { color: 0x140c18, width: 6 } },
    });
    name.anchor.set(0.5, 1);
    name.y = -10;
    this.hud.addChild(back, this.barFill, name);
  }
}

/** White at 0; a pale cold flash at 1 (no warm tint on enemies). */
function flash(k: number): number {
  const r = Math.round(255 - 60 * k);
  return (r << 16) | (r << 8) | 0xff;
}
