import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Platform } from '../platform/types';
import { DragStick } from './dragStick';
import { launch, nearest, stepBall, type Ball, type BallParams } from './cuju';
import { Hero } from './hero';
import { FxLayer } from './fxView';
import { Corpses, MobView, type MobSheet } from './mobView';
import type { TaoAsset } from './tao/TaoActor';
import { stepHorde, type Mob } from './horde';
import { computeViewport, type Viewport } from './viewport';

// Prototype scene: the hero walks around a field while a jiangshi horde and one fox elite
// chase him. He auto-kicks the cuju at the nearest enemy and flinches when they touch him.
// Exists to prove the portrait viewport, input, art scale and feel on every host.

export interface Art {
  hero: TaoAsset;
  jiangshi: MobSheet;
  fox: MobSheet;
  cuju: Texture;
}

const HERO_SPEED = 420;
const HERO_HEIGHT = 120;
const MOB_COUNT = 40;
const RESPAWN_DIST = 2200;
const STICK_RADIUS = 70;
const GROUND = 0x3a4a3c;
const TUFT = 0x2f3e31;
const FIELD = 4000;
const KICK_RANGE = 650;
const KICK_COOLDOWN = 0.9;
const HURT_DIST = 85;
const HURT_COOLDOWN = 1;
const BALL_SIZE = 48;
const BALL_LIFT = 45; // drawn this far above its ground point
const BALL: BallParams = { speed: 1300, hitRadius: 55, seekRange: 600, maxHits: 3, maxTravel: 900 };
const FOX_KNOCKBACK = 160;
const FOX_STOP = 220;
const MOB_HEIGHT = 80;
const FOX_HEIGHT = 130;

interface Enemy {
  pos: Mob;
  view: MobView;
}

interface BallView {
  ball: Ball;
  sprite: Sprite;
  shadow: Graphics;
}

export class Game {
  private readonly stick = new DragStick(STICK_RADIUS);
  private readonly root = new Container();
  private readonly world = new Container();
  private readonly playMask = new Graphics();
  private readonly stickGfx = new Graphics();
  private readonly label = new Text({ text: '', style: { fill: 0xffffff, fontFamily: 'Arial', stroke: { color: 0x000000, width: 4 } } });
  private readonly hero: Hero;
  private readonly heroPos = { x: 0, y: 0 };
  private readonly heroShadow = new Graphics().ellipse(0, 0, 34, 11).fill({ color: 0x000000, alpha: 0.3 });
  private readonly fox: Enemy;
  private readonly mobs: Enemy[] = [];
  private readonly corpses: Corpses;
  private readonly fx: FxLayer;
  /** Mob positions then the fox, the order ball hits are reported in. */
  private readonly targets: Mob[] = [];
  private readonly balls: BallView[] = [];
  private readonly cujuTex: Texture;
  private kickTimer = 0;
  private hurtTimer = 0;
  private vp: Viewport = computeViewport(1, 1);
  private screenKey = '';
  private fpsTimer = 0;

  constructor(
    private readonly app: Application,
    private readonly platform: Platform,
    art: Art,
  ) {
    this.world.sortableChildren = true;
    this.world.addChild(makeGround());
    this.hero = new Hero(art.hero, HERO_HEIGHT);
    this.heroShadow.zIndex = -1e6;
    this.world.addChild(this.heroShadow, this.hero.view);
    this.cujuTex = art.cuju;
    this.corpses = new Corpses(this.world);
    this.fx = new FxLayer(app.renderer);
    this.world.addChild(this.fx.view);
    const fox = { sheet: art.fox, height: FOX_HEIGHT, facesLeft: false, shadow: [62, 15] as [number, number] };
    this.fox = { pos: { x: 300, y: -900 }, view: new MobView(fox, this.world) };
    const jiangshi = { sheet: art.jiangshi, height: MOB_HEIGHT, facesLeft: true, shadow: [27, 9] as [number, number] };
    for (let i = 0; i < MOB_COUNT; i++) {
      this.mobs.push({ pos: ringPoint(0, 0), view: new MobView(jiangshi, this.world) });
    }
    this.targets.push(...this.mobs.map((m) => m.pos), this.fox.pos);

    this.root.addChild(this.world, this.label);
    this.root.mask = this.playMask;
    app.stage.addChild(this.playMask, this.root, this.stickGfx);

    platform.bindStick(app, this.stick);
    app.ticker.add((t) => this.tick(Math.min(t.deltaMS / 1000, 0.05)));
  }

  /** Re-fit to the screen whenever its size changes (resize, rotation, portal iframe). */
  private layout(): void {
    const { width, height } = this.app.screen;
    const key = `${width}x${height}`;
    if (key === this.screenKey) return;
    this.screenKey = key;
    const vp = (this.vp = computeViewport(width, height));
    this.root.position.set(vp.playX, vp.playY);
    this.playMask.clear().rect(vp.playX, vp.playY, vp.playW, vp.playH).fill(0xffffff);
    this.world.scale.set(vp.scale);
    this.label.style.fontSize = Math.max(10, 48 * vp.scale);
    this.label.style.stroke = { color: 0x000000, width: Math.max(1, 4 * vp.scale) };
    this.label.position.set(24 * vp.scale, 24 * vp.scale);
  }

  private tick(dt: number): void {
    this.layout();
    const vp = this.vp;

    const s = this.stick.read();
    const k = this.platform.readKeys();
    let mx = s.x + k.x;
    let my = s.y + k.y;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.heroPos.x += mx * HERO_SPEED * dt;
    this.heroPos.y += my * HERO_SPEED * dt;
    if (this.hero.update(dt, mx, len > 0.1)) this.strike();
    place(this.hero.view, this.heroPos);
    this.heroShadow.position.set(this.heroPos.x, this.heroPos.y);
    this.hero.view.alpha = this.hurtTimer > HURT_COOLDOWN - 0.4 && Math.floor(this.hurtTimer * 20) % 2 ? 0.5 : 1;

    const hx = this.heroPos.x;
    const hy = this.heroPos.y;
    const positions = this.mobs.map((m) => m.pos);
    stepHorde(positions, hx, hy, dt, { speed: 110, stopDist: 70, sepRadius: 60 });
    for (const m of this.mobs) {
      if (Math.hypot(m.pos.x - hx, m.pos.y - hy) > RESPAWN_DIST) Object.assign(m.pos, ringPoint(hx, hy));
      m.view.update(dt, m.pos.x, m.pos.y, hx - m.pos.x);
    }
    const fp = this.fox.pos;
    stepHorde([fp], hx, hy, dt, { speed: 160, stopDist: FOX_STOP, sepRadius: 0 });
    const foxRunning = Math.hypot(fp.x - hx, fp.y - hy) > FOX_STOP + 5;
    this.fox.view.update(dt, fp.x, fp.y, hx - fp.x, foxRunning ? 1 : 0.35);
    this.corpses.update(dt);
    this.fx.update(dt);

    this.combat(dt);

    // Camera: keep the hero at the centre of the play area.
    this.world.position.set(vp.playW / 2 - hx * vp.scale, vp.playH / 2 - hy * vp.scale);

    this.drawStick();
    this.fpsTimer -= dt;
    if (this.fpsTimer <= 0) {
      this.fpsTimer = 0.5;
      this.label.text = `Holy Kicker  ${Math.round(this.app.ticker.FPS)} fps`;
    }
  }

  /** Auto-kick at the nearest enemy, fly the balls, and flinch on contact. */
  private combat(dt: number): void {
    const { x: hx, y: hy } = this.heroPos;
    this.kickTimer -= dt;
    if (this.kickTimer <= 0) {
      const t = nearest(this.targets, hx, hy, KICK_RANGE);
      if (t >= 0 && this.hero.kick(this.targets[t].x - hx)) this.kickTimer = KICK_COOLDOWN;
    }

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const hit = stepBall(b.ball, this.targets, dt, BALL);
      if (hit >= 0) {
        this.fx.hit(b.ball.x, b.ball.y - BALL_LIFT);
        this.knock(hit);
      }
      if (!b.ball.alive) {
        b.sprite.destroy();
        b.shadow.destroy();
        this.balls.splice(i, 1);
        continue;
      }
      b.sprite.position.set(b.ball.x, b.ball.y - BALL_LIFT);
      b.sprite.rotation += dt * 14 * Math.sign(b.ball.vx || 1);
      b.sprite.zIndex = b.ball.y + 1;
      b.shadow.position.set(b.ball.x, b.ball.y);
    }

    this.hurtTimer -= dt;
    if (this.hurtTimer <= 0 && nearest(this.targets, hx, hy, HURT_DIST) >= 0) {
      this.hurtTimer = HURT_COOLDOWN;
      this.hero.hurt();
    }
  }

  /** The kick connects: launch a ball from the hero's foot at the nearest enemy. */
  private strike(): void {
    const { x: hx, y: hy } = this.heroPos;
    const t = nearest(this.targets, hx, hy, KICK_RANGE * 1.3);
    const fx = hx + this.hero.facing * 40;
    const tx = t >= 0 ? this.targets[t].x : fx + this.hero.facing * 100;
    const ty = t >= 0 ? this.targets[t].y : hy;
    const sprite = new Sprite(this.cujuTex);
    sprite.anchor.set(0.5);
    sprite.scale.set(BALL_SIZE / this.cujuTex.height);
    const shadow = new Graphics().ellipse(0, 0, BALL_SIZE * 0.4, BALL_SIZE * 0.15).fill({ color: 0x000000, alpha: 0.3 });
    shadow.zIndex = -1e6; // ground decal, under every standing figure
    this.world.addChild(shadow, sprite);
    const ball = launch(fx, hy, tx, ty, BALL);
    this.balls.push({ ball, sprite, shadow });
  }

  /** A ball hit: jiangshi go down (respawn off-screen), the elite fox is knocked back. */
  private knock(i: number): void {
    const { x: hx, y: hy } = this.heroPos;
    const p = this.targets[i];
    if (p === this.fox.pos) {
      this.fox.view.flinch();
      const d = Math.hypot(p.x - hx, p.y - hy) || 1;
      p.x += ((p.x - hx) / d) * FOX_KNOCKBACK;
      p.y += ((p.y - hy) / d) * FOX_KNOCKBACK;
    } else {
      this.corpses.spawn(this.mobs[i].view, p.x - hx, p.y - hy);
      this.fx.puff(p.x, p.y);
      Object.assign(p, ringPoint(hx, hy));
    }
  }

  private drawStick(): void {
    const g = this.stickGfx.clear();
    const o = this.stick.origin();
    if (!o) return;
    const v = this.stick.read();
    g.circle(o.x, o.y, STICK_RADIUS).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ color: 0xffffff, alpha: 0.35, width: 3 });
    g.circle(o.x + v.x * STICK_RADIUS, o.y + v.y * STICK_RADIUS, STICK_RADIUS * 0.45).fill({ color: 0xffffff, alpha: 0.4 });
  }
}

function place(s: Container, p: Mob): void {
  s.position.set(p.x, p.y);
  s.zIndex = p.y;
}

/** A random point on a ring around (cx, cy), just outside the phone view. */
function ringPoint(cx: number, cy: number): Mob {
  const a = Math.random() * Math.PI * 2;
  const r = 900 + Math.random() * 500;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

/** Flat field with scattered grass tufts, so movement is visible. */
function makeGround(): Graphics {
  const g = new Graphics();
  g.rect(-FIELD, -FIELD, FIELD * 2, FIELD * 2).fill(GROUND);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    g.rect(-FIELD + rand() * FIELD * 2, -FIELD + rand() * FIELD * 2, 14 + rand() * 10, 8).fill(TUFT);
  }
  g.zIndex = -Infinity;
  return g;
}
