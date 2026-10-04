import { Container, Sprite, type Renderer, type Texture } from 'pixi.js';
import { DEMON, FP, TICK_RATE, type Boss as BossState } from '@hk/engine';
import { t } from '../i18n';
import { BossBar } from './bossBar';
import { DarkAura } from './darkAura';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import { makeShadow } from './shadow';
import { TaoActor, type TaoAsset } from './tao/TaoActor';

// The Inner Demon, chapter 5's last boss (engine systems/demon.ts): the hero's own rig drawn from
// a cold recolour of his atlas (tools/recolor_cold.py), wearing his angry face, standing in the
// dark aura. It runs while it circles him, kicks as its relic attack or spell goes out (the
// attacks are the threat layer's bullets and zones), and a leap lands with the slam's ring.
// Same surface as the other boss views, so the game drives it through BossStage.

const VIOLET = 0xb04cff;
const HURT_TINT_TIME = 0.15;
const FADE = 0.5;
/** The motes it gathers while winding up: cold, not the hero's gold. */
const GATHER = 0x8fd0ff;
/** Below half its health it throbs between white and this. */
const RAGE_TINT = 0xa0b0ff;

export class DemonView {
  readonly view = new Container();
  private readonly bar = new BossBar(t('boss.demon'));
  readonly hud = this.bar.view;
  private readonly actor: TaoActor;
  private readonly body = new Container();
  private readonly shadow: Sprite;
  private readonly aura: DarkAura;
  private facing = -1;
  private tint = 0;
  private time = 0;
  private glow = 0;

  constructor(renderer: Renderer, world: Container, asset: TaoAsset, shadowTex: Texture, readonly height: number, private readonly fx: FxPool) {
    this.actor = new TaoActor(asset);
    this.actor.view.scale.set(height / this.actor.height);
    this.actor.play('run');
    this.actor.setImage('face', 'face_strain');
    this.body.addChild(this.actor.view);
    this.aura = new DarkAura(renderer, height);
    this.view.addChild(this.aura.view, this.body);
    this.shadow = makeShadow(shadowTex, height * 0.3, height * 0.09);
    world.addChild(this.shadow, this.view);
  }

  draw(b: BossState, alpha: number, dt: number, hx: number): void {
    const x = lerpX(b, alpha);
    const y = lerpY(b, alpha);
    this.time += dt;
    this.view.alpha = b.phase === 'down' ? Math.max(0, 1 - (b.t + alpha) / TICK_RATE / FADE) : 1;
    this.shadow.visible = this.view.alpha > 0;
    if (Math.abs(hx - x) > 30) this.facing = hx < x ? -1 : 1;
    // drawn facing left, like the hero; mirror to face right
    this.body.scale.x = -this.facing;
    if (this.actor.finished || this.actor.current === 'run' || this.actor.current === 'idle') {
      this.actor.play(b.phase === 'windup' ? 'idle' : 'run');
    }
    this.actor.update(dt);
    this.aura.update(dt);
    if (this.tint > 0) this.tint = Math.max(0, this.tint - dt);
    const rage = b.hp * 100 <= b.maxHp * DEMON.ragePercent;
    this.actor.view.tint = this.tint > 0 ? 0xc3c3ff : rage ? throb(this.time) : 0xffffff;
    this.view.position.set(x, y);
    this.shadow.position.set(x, y);
    if (b.phase === 'windup') this.gather(x, y - this.height * 0.5, Math.min(1, (b.t + alpha) / DEMON.windup), dt);
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

  /** Its attack goes out from (x, y), world units: a kick and a cold burst at its middle. */
  cast(x: number, y: number): void {
    this.actor.play('kick', true);
    const cy = y - this.height * 0.45;
    this.fx.emit({ shape: 'ring', x, y: cy, vx: 0, vy: 0, life: 0.3, size0: 40, size1: 200, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.85 });
    this.fx.emit({ shape: 'glow', x, y: cy, vx: 0, vy: 0, life: 0.25, size0: 150, size1: 60, rotation: 0, spin: 0, drag: 1, color: GATHER, alpha: 0.6 });
  }

  /** It came down from a leap at (x, y): the slam's ring and dust. */
  impact(x: number, y: number, r: number): void {
    this.actor.play('kick', true);
    this.fx.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.3, size0: r, size1: r * 2.2, rotation: 0, spin: 0, drag: 1, color: VIOLET, alpha: 0.9 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.fx.puff(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
    }
  }

  down(b: BossState): void {
    for (let i = 0; i < 6; i++) this.fx.puff(b.x / FP + (i - 2.5) * 40, b.y / FP - (i % 2) * 60);
  }

  back(): void {}

  layout(playW: number, scale: number): void {
    this.bar.layout(playW, scale);
  }

  /** Cold motes drawn in to its middle while it winds up, `k` (0..1) of the way. */
  private gather(x: number, y: number, k: number, dt: number): void {
    this.glow += dt * (6 + 18 * k);
    while (this.glow >= 1) {
      this.glow -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = 110 + Math.random() * 60;
      this.fx.emit({
        shape: 'glow', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.6, vy: -Math.sin(a) * r * 2.6, life: 0.35,
        size0: 24, size1: 8, rotation: 0, spin: 0, drag: 1, color: GATHER, alpha: 0.9,
      });
    }
  }
}

/** White to RAGE_TINT and back, about once a second. */
function throb(time: number): number {
  const k = 0.5 + 0.5 * Math.sin(time * 6);
  const ch = (sh: number) => Math.round(0xff + (((RAGE_TINT >> sh) & 0xff) - 0xff) * k) << sh;
  return ch(16) | ch(8) | ch(0);
}
