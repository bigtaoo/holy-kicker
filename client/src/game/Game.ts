import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Platform } from '../platform/types';
import { DragStick } from './dragStick';
import { stepHorde, type Mob } from './horde';
import { computeViewport, type Viewport } from './viewport';

// Prototype scene: the hero walks around a field while a jiangshi horde and one fox elite
// chase him. Exists to prove the portrait viewport, input and art scale on every host.

export interface Art {
  hero: Texture;
  jiangshi: Texture;
  fox: Texture;
}

const HERO_SPEED = 420;
const MOB_COUNT = 40;
const RESPAWN_DIST = 2200;
const STICK_RADIUS = 70;
const GROUND = 0x3a4a3c;
const TUFT = 0x2f3e31;
const FIELD = 4000;

interface MobView {
  pos: Mob;
  sprite: Sprite;
}

export class Game {
  private readonly stick = new DragStick(STICK_RADIUS);
  private readonly root = new Container();
  private readonly world = new Container();
  private readonly playMask = new Graphics();
  private readonly stickGfx = new Graphics();
  private readonly label = new Text({ text: '', style: { fill: 0xffffff, fontFamily: 'Arial', stroke: { color: 0x000000, width: 4 } } });
  private readonly hero: Sprite;
  private readonly heroPos = { x: 0, y: 0 };
  private readonly fox: MobView;
  private readonly mobs: MobView[] = [];
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
    this.hero = this.addSprite(art.hero);
    this.fox = { pos: { x: 300, y: -900 }, sprite: this.addSprite(art.fox) };
    for (let i = 0; i < MOB_COUNT; i++) {
      this.mobs.push({ pos: ringPoint(0, 0), sprite: this.addSprite(art.jiangshi) });
    }

    this.root.addChild(this.world, this.label);
    this.root.mask = this.playMask;
    app.stage.addChild(this.playMask, this.root, this.stickGfx);

    platform.bindStick(app, this.stick);
    app.ticker.add((t) => this.tick(Math.min(t.deltaMS / 1000, 0.05)));
  }

  private addSprite(tex: Texture): Sprite {
    const s = new Sprite(tex);
    s.anchor.set(0.5, 1);
    this.world.addChild(s);
    return s;
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
    if (mx !== 0) this.hero.scale.x = mx < 0 ? -1 : 1;
    place(this.hero, this.heroPos);

    const hx = this.heroPos.x;
    const hy = this.heroPos.y;
    const positions = this.mobs.map((m) => m.pos);
    stepHorde(positions, hx, hy, dt, { speed: 110, stopDist: 70, sepRadius: 60 });
    for (const m of this.mobs) {
      if (Math.hypot(m.pos.x - hx, m.pos.y - hy) > RESPAWN_DIST) Object.assign(m.pos, ringPoint(hx, hy));
      place(m.sprite, m.pos);
    }
    stepHorde([this.fox.pos], hx, hy, dt, { speed: 160, stopDist: 220, sepRadius: 0 });
    // The fox art faces right.
    this.fox.sprite.scale.x = hx < this.fox.pos.x ? -1 : 1;
    place(this.fox.sprite, this.fox.pos);

    // Camera: keep the hero at the centre of the play area.
    this.world.position.set(vp.playW / 2 - hx * vp.scale, vp.playH / 2 - hy * vp.scale);

    this.drawStick();
    this.fpsTimer -= dt;
    if (this.fpsTimer <= 0) {
      this.fpsTimer = 0.5;
      this.label.text = `Holy Kicker  ${Math.round(this.app.ticker.FPS)} fps`;
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

function place(s: Sprite, p: Mob): void {
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
