import { Container, Sprite, Text, Texture, type Renderer } from 'pixi.js';
import { BOSS, hurtBoss, newBoss, stepBoss, windupProgress, type BossState } from './boss';
import type { FxPool } from './fx';
import type { Mob } from './horde';
import { makeShadow } from './shadow';
import { TaoActor, type TaoAsset } from './tao/TaoActor';
import { ZONE_TOP_Z, zoneTextures } from './threatView';

// The boss on screen: the cutout rig (walk / slam / hurt), its slam warning in the enemy
// attack violet, the impact, and a health bar across the top of the play area.

const VIOLET = 0xb04cff;
const ZONE_TEX = 128;
const HURT_TINT_TIME = 0.15;
const RESPAWN_AFTER = 3;
const BAR_W = 760;
const BAR_H = 26;

export class Boss {
  /** Hit target for balls and spells; the boss's own position object. */
  readonly pos: Mob;
  readonly view = new Container();
  /** Screen-space bar, placed by the game in play-area units. */
  readonly hud = new Container();
  private readonly state: BossState;
  private readonly actor: TaoActor;
  private readonly body = new Container();
  private readonly shadow: Sprite;
  private readonly zone: [Sprite, Sprite];
  private readonly barFill = new Sprite(Texture.WHITE);
  private facing = -1;
  private tint = 0;
  private downTimer = 0;

  constructor(
    renderer: Renderer,
    world: Container,
    asset: TaoAsset,
    shadowTex: Texture,
    readonly height: number,
    private readonly fx: FxPool,
    x: number,
    y: number,
  ) {
    this.state = newBoss(x, y);
    this.pos = this.state;
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

  /** False while it lies defeated, waiting to come back. */
  get alive(): boolean {
    return this.downTimer <= 0;
  }

  /** Steps behaviour and animation; true when a slam lands on the hero. */
  update(dt: number, hx: number, hy: number): boolean {
    const b = this.state;
    if (this.downTimer > 0) {
      this.downTimer -= dt;
      this.view.alpha = Math.max(0, this.downTimer - (RESPAWN_AFTER - 0.5)) / 0.5;
      if (this.downTimer <= 0) this.respawn(hx, hy);
      return false;
    }
    const event = stepBoss(b, hx, hy, dt);
    if (event === 'windup') {
      this.actor.play('slam', true);
      // face the circle it is about to smash
      if (b.zoneX !== b.x) this.facing = b.zoneX < b.x ? -1 : 1;
    }
    if (event === 'slam' || event === 'slamHit') this.impact();
    if (b.phase === 'walk') {
      if (Math.abs(hx - b.x) > 30) this.facing = hx < b.x ? -1 : 1;
      if (this.actor.current !== 'hurt' || this.actor.finished) this.actor.play('walk');
    }
    // drawn facing left; mirror to face right
    this.body.scale.x = -this.facing;
    this.actor.update(dt);
    this.view.position.set(b.x, b.y);
    this.shadow.position.set(b.x, b.y);
    if (this.tint > 0) this.tint = Math.max(0, this.tint - dt);
    this.actor.view.tint = flash(this.tint / HURT_TINT_TIME);
    this.drawZone();
    return event === 'slamHit';
  }

  /** A ball or spell hit. Returns the height to show the damage number at. */
  hit(damage: number): number {
    if (this.downTimer > 0) return this.height;
    this.tint = HURT_TINT_TIME;
    // the slam is not interrupted: a boss that flinches out of every attack never threatens
    if (this.state.phase === 'walk') this.actor.play('hurt', true);
    if (hurtBoss(this.state, damage)) this.down();
    this.barFill.scale.x = (BAR_W * this.state.hp) / BOSS.hp;
    return this.height;
  }

  /** Keeps the bar centred across the top of the play area (play-area pixels and scale). */
  layout(playW: number, scale: number): void {
    this.hud.scale.set(scale);
    this.hud.position.set(playW / 2, 210 * scale);
  }

  private drawZone(): void {
    const b = this.state;
    const t = windupProgress(b);
    const [outer, inner] = this.zone;
    outer.visible = inner.visible = b.phase === 'windup';
    if (!outer.visible) return;
    const k = (BOSS.slamRadius * 2) / (ZONE_TEX - 8);
    outer.position.set(b.zoneX, b.zoneY);
    inner.position.set(b.zoneX, b.zoneY);
    outer.scale.set(k * Math.min(1, 0.6 + b.t * 4));
    inner.scale.set(k * t);
  }

  private impact(): void {
    const { zoneX: x, zoneY: y } = this.state;
    const r = BOSS.slamRadius;
    this.fx.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.3, size0: r, size1: r * 2.4, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.9 });
    this.fx.emit({ shape: 'glow', x, y, vx: 0, vy: 0, life: 0.22, size0: r * 2, size1: r * 2.2, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.5 });
    // dust kicked up around the rim
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.fx.puff(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
    }
  }

  private down(): void {
    this.downTimer = RESPAWN_AFTER;
    this.zone[0].visible = this.zone[1].visible = false;
    for (let i = 0; i < 6; i++) this.fx.puff(this.state.x + (i - 2.5) * 40, this.state.y - (i % 2) * 60);
  }

  private respawn(hx: number, hy: number): void {
    const a = Math.random() * Math.PI * 2;
    const fresh = newBoss(hx + Math.cos(a) * 1000, hy + Math.sin(a) * 1000);
    Object.assign(this.state, fresh);
    this.view.alpha = 1;
    this.barFill.scale.x = BAR_W;
    this.actor.play('walk', true);
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
