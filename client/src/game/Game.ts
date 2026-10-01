import { Application, BlurFilter, Container, Graphics, Rectangle, Sprite, Text, TilingSprite, type Renderer, type Texture } from 'pixi.js';
import type { Platform } from '../platform/types';
import { DragStick } from './dragStick';
import { BALL_LIFT, Balls } from './ballView';
import { nearest, type BallParams } from './cuju';
import { Hero } from './hero';
import { DamageLayer } from './damageView';
import { DropLayer } from './dropView';
import { ThreatLayer } from './threatView';
import { FxLayer } from './fxView';
import { Corpses, MobView, type MobSheet } from './mobView';
import { depthShade } from './mobAnim';
import { fakeMobTypes } from './mobTypes';
import { AuraStack } from './aura';
import { Boss } from './bossView';
import { SpellCaster } from './spellCaster';
import type { TaoAsset } from './tao/TaoActor';
import { SpatialGrid } from './grid';
import { SHADOW_Z, makeShadow, shadowTexture } from './shadow';
import { makeDeco, type DecoSheet } from './decoView';
import type { EliteColor, SceneOptions } from './scene';
import type { LevelSettings } from './quality';
import { stepHorde, type HordeParams, type Mob } from './horde';
import { computeViewport, type Viewport } from './viewport';
import { LOCKED_CAMERA, SMOOTH_CAMERA, ease, snapToPixel } from './camera';

// Prototype scene: the hero walks around a field while a jiangshi horde and one fox elite
// chase him. He auto-kicks the cuju at the nearest enemy and flinches when they touch him.
// Exists to prove the portrait viewport, input, art scale and feel on every host.

export interface Art {
  hero: TaoAsset;
  jiangshi: MobSheet;
  fox: MobSheet;
  cuju: Texture;
  /** Repeating ground tile; null draws the flat placeholder field. */
  ground: Texture | null;
  /** Scattered ground decorations; null when the scene turns them off. */
  deco: DecoSheet | null;
  /** The boss rig; null when the scene leaves the boss out. */
  boss: TaoAsset | null;
}

const HERO_SPEED = 420;
const HERO_HEIGHT = 120;
const HORDE: HordeParams = { speed: 110, stopDist: 70, sepRadius: 75, queue: true };
const RESPAWN_DIST = 2200;
const STICK_RADIUS = 70;
const GROUND = 0x3a4a3c;
const TUFT = 0x2f3e31;
const FIELD = 4000;
const KICK_RANGE = 650;
const KICK_COOLDOWN = 0.9;
const HURT_DIST = 85;
const HURT_COOLDOWN = 1;
/** Seconds the hero's red hurt flash takes to fade. */
const HURT_FLASH = 0.35;
const BALL: BallParams = { speed: 1300, hitRadius: 55, seekRange: 600, maxHits: 3, maxTravel: 900 };
const FOX_KNOCKBACK = 160;
const FOX_STOP = 220;
const FOX_MOVE: HordeParams = { speed: 160, stopDist: FOX_STOP, sepRadius: 0 };
const MOB_HEIGHT = 80;
const FOX_HEIGHT = 130;
const CRIT_CHANCE = 0.2;
/** World units per ground tile pixel. */
const GROUND_SCALE = 1.5;
/** Above every mob, below the effects (1e7) and numbers (1e7 + 1). */
const HERO_TOP_Z = 5e6;
const HERO_OVER_FX_Z = 1e7 + 0.5;
const SCREEN_AREA = 1080 * 1920;
const ELITE_RING: Record<EliteColor, number> = { red: 0xe0303a, white: 0xffffff, violet: 0xb04cff };
const FOX_TINT = 0xc8a8ff;

interface Enemy {
  pos: Mob;
  view: MobView;
}

export class Game {
  private readonly stick = new DragStick(STICK_RADIUS);
  private readonly root = new Container();
  private readonly world = new Container();
  private readonly playMask = new Graphics();
  private readonly label = new Text({ text: '', style: { fill: 0xffffff, fontFamily: 'Arial', stroke: { color: 0x000000, width: 4 } } });
  private readonly hero: Hero;
  private readonly heroPos = { x: 0, y: 0 };
  private readonly heroVel = { x: 0, y: 0 };
  /** World point the camera centres on; trails the hero under the smooth camera. */
  private readonly camPos = { x: 0, y: 0 };
  private readonly fox: Enemy;
  private readonly foxPos: Mob[];
  private readonly mobs: Enemy[] = [];
  private readonly mobPos: Mob[] = [];
  private readonly horde: HordeParams;
  private readonly grid: SpatialGrid;
  private readonly corpses: Corpses;
  private readonly fx: FxLayer;
  private readonly damage: DamageLayer;
  private readonly drops: DropLayer;
  private readonly threats: ThreatLayer | null;
  /** Mob positions then the fox, the order ball hits are reported in. */
  private readonly targets: Mob[] = [];
  private readonly balls: Balls;
  private readonly foxRing: Sprite;
  private readonly boss: Boss | null;
  private readonly stickBase: Sprite;
  private readonly stickKnob: Sprite;
  private readonly onHit = (target: number, x: number, y: number) => {
    this.fx.hit(x, y - BALL_LIFT);
    this.knock(target);
  };
  private readonly caster: SpellCaster;
  private readonly aura: AuraStack;
  private kickTimer = 0;
  private hurtTimer = 0;
  private vp: Viewport = computeViewport(1, 1);
  private screenKey = '';
  private fpsTimer = 0;
  private levelName = '';

  constructor(
    private readonly app: Application,
    private readonly platform: Platform,
    art: Art,
    private readonly scene: SceneOptions,
  ) {
    this.horde = { ...HORDE, sepRadius: scene.sep, queue: scene.queue };
    this.grid = new SpatialGrid(this.horde.sepRadius);
    this.world.sortableChildren = true;
    this.world.addChild(art.ground ? makeTiledGround(art.ground) : makeGround());
    if (art.deco && scene.deco !== 'none') {
      const deco = makeDeco(art.deco, scene.deco === 'props');
      deco.zIndex = SHADOW_Z - 1;
      this.world.addChild(deco);
    }
    const shadowTex = shadowTexture(app.renderer);
    this.hero = new Hero(art.hero, HERO_HEIGHT);
    this.world.addChild(makeShadow(shadowTex, 34, 11), this.hero.view);
    if (scene.ring) this.hero.view.addChildAt(makeRing(app.renderer, 0xffb030), 0);
    if (scene.heroBack) this.hero.view.addChildAt(heroBacking(app.renderer), 0);
    this.foxRing = makeRing(app.renderer, ELITE_RING[scene.eliteColor], 1.8, scene.eliteColor !== 'red');
    this.balls = new Balls(this.world, art.cuju, shadowTex, BALL);
    this.corpses = new Corpses(this.world);
    this.fx = new FxLayer(app.renderer);
    this.damage = new DamageLayer(app.renderer, scene.crit, scene.numFade);
    this.world.addChild(this.fx.view, this.damage.view);
    this.drops = new DropLayer(app.renderer, this.world, scene.gem, this.fx.pool);
    for (let i = 0; i < scene.drops; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 300 + Math.sqrt(Math.random()) * 2700;
      this.drops.field.drop(Math.cos(a) * r, Math.sin(a) * r, 1);
    }
    this.threats = scene.threats
      ? new ThreatLayer(app.renderer, this.world, scene.bullet, scene.zone, scene.zoneLayer, this.fx.pool)
      : null;
    const fox = { sheet: art.fox, height: FOX_HEIGHT, facesLeft: false, shadow: [62, 15] as [number, number], shadowTex };
    this.fox = { pos: { x: 300, y: -900 }, view: new MobView(fox, this.world) };
    this.foxPos = [this.fox.pos];
    // a multiply tint is free: it turns the pale fox lavender, away from the teal horde
    if (scene.foxTint) this.fox.view.sprite.tint = FOX_TINT;
    if (scene.eliteRing) this.world.addChild(this.foxRing);
    const looks = fakeMobTypes(app.renderer, art.jiangshi, scene.types, scene.page, scene.mobRes).map((sheet) => (
      { sheet, height: MOB_HEIGHT, facesLeft: true, shadow: [27, 9] as [number, number], shadowTex }
    ));
    for (let i = 0; i < scene.mobs; i++) {
      this.mobs.push({ pos: ringPoint(0, 0, { x: 0, y: 0 }), view: new MobView(looks[i % looks.length], this.world, scene.calm) });
    }
    this.mobPos.push(...this.mobs.map((m) => m.pos));
    this.targets.push(...this.mobPos, this.fox.pos);
    this.boss = art.boss ? new Boss(app.renderer, this.world, art.boss, shadowTex, scene.bossSize, this.fx.pool, -200, -1100) : null;
    if (this.boss) {
      this.targets.push(this.boss.pos);
      // like the elite, the boss draws over the horde
      if (scene.eliteRing) this.boss.view.zIndex = HERO_TOP_Z - 1;
    }
    if (scene.blur) this.fx.view.filters = [new BlurFilter({ strength: 6, quality: 2 })];
    this.caster = new SpellCaster(app.renderer, this.world, this.fx.pool, scene.spells, scene.rate, scene.ringFx, this.targets, (i) => this.knock(i));
    this.aura = new AuraStack(scene.stack);

    this.root.addChild(this.world, this.label);
    if (this.boss) this.root.addChild(this.boss.hud);
    this.root.mask = this.playMask;
    [this.stickBase, this.stickKnob] = stickSprites(app.renderer);
    app.stage.addChild(this.playMask, this.root, this.stickBase, this.stickKnob);

    platform.bindStick(app, this.stick);
    app.ticker.add((t) => this.tick(Math.min(t.deltaMS / 1000, 0.05)));
  }

  /** Quality level parts that live in the scene; the runtime handles resolution and fps. */
  applyQuality(s: LevelSettings): void {
    // an explicit ?fxbudget= in the URL wins, for stress tests
    this.fx.pool.budget = (this.scene.fxBudget || s.fxBudget) * SCREEN_AREA;
    this.damage.pool.max = s.numbers;
    this.levelName = s.name;
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
    this.boss?.layout(vp.playW, vp.scale);
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
    const cam = this.scene.cam === 'lock' ? LOCKED_CAMERA : SMOOTH_CAMERA;
    ease(this.heroVel, mx * HERO_SPEED, my * HERO_SPEED, dt, cam.heroEase);
    this.heroPos.x += this.heroVel.x * dt;
    this.heroPos.y += this.heroVel.y * dt;
    if (this.hero.update(dt, mx, len > 0.1)) this.strike();
    place(this.hero.view, this.heroPos);
    if (this.scene.heroOnTop) this.hero.view.zIndex = this.scene.heroOverFx ? HERO_OVER_FX_Z : HERO_TOP_Z;
    // a red flash that fades, not a see-through blink: a 10 Hz strobe over the crowd is tiring
    this.hero.view.tint = hurtTint(Math.max(0, this.hurtTimer - (HURT_COOLDOWN - HURT_FLASH)) / HURT_FLASH);

    const hx = this.heroPos.x;
    const hy = this.heroPos.y;
    stepHorde(this.mobPos, hx, hy, dt, this.horde, this.grid);
    for (const m of this.mobs) {
      if (Math.hypot(m.pos.x - hx, m.pos.y - hy) > RESPAWN_DIST) ringPoint(hx, hy, m.pos);
      m.view.update(dt, m.pos.x, m.pos.y, hx - m.pos.x, 1, this.scene.settle ? HORDE.speed : 0, this.scene.sway);
      if (this.scene.calm) m.view.shade(depthShade(Math.hypot(m.pos.x - hx, m.pos.y - hy)));
    }
    const fp = this.fox.pos;
    stepHorde(this.foxPos, hx, hy, dt, FOX_MOVE);
    const foxRunning = Math.hypot(fp.x - hx, fp.y - hy) > FOX_STOP + 5;
    this.fox.view.update(dt, fp.x, fp.y, hx - fp.x, foxRunning ? 1 : 0.35);
    this.foxRing.position.set(fp.x, fp.y);
    if (this.scene.eliteRing) {
      // the elite and its ring draw over the horde, just under the hero
      this.fox.view.sprite.zIndex = HERO_TOP_Z - 1;
      this.foxRing.zIndex = HERO_TOP_Z - 2;
    }
    this.corpses.update(dt);
    this.caster.update(dt, hx, hy);
    this.aura.update(dt, hx, hy, this.fx.pool);
    this.fx.update(dt, this.aura.parts);
    this.damage.update(dt, hx, hy);
    this.drops.update(dt, hx, hy);
    if (this.threats?.update(dt, hx, hy, this.mobPos)) this.hurt();
    if (this.boss?.update(dt, hx, hy)) this.hurt();

    this.combat(dt);

    // Camera: ease after the hero towards the centre of the play area, on whole pixels.
    ease(this.camPos, hx, hy, dt, cam.camEase);
    const res = this.app.renderer.resolution;
    this.world.position.set(
      snapToPixel(vp.playW / 2 - this.camPos.x * vp.scale, res),
      snapToPixel(vp.playH / 2 - this.camPos.y * vp.scale, res),
    );

    this.drawStick();
    this.fpsTimer -= dt;
    if (this.fpsTimer <= 0) {
      this.fpsTimer = 0.5;
      const f = this.drops.field;
      this.label.text = `Holy Kicker  ${Math.round(this.app.ticker.FPS)} fps  ${this.levelName}
xp ${f.collected}  gems ${f.gems.length}`;
    }
  }

  /** Auto-kick at the nearest enemy, fly the balls, and flinch on contact. */
  private combat(dt: number): void {
    const { x: hx, y: hy } = this.heroPos;
    this.kickTimer -= dt;
    if (this.kickTimer <= 0) {
      const t = this.kickTarget(KICK_RANGE);
      if (t >= 0 && this.hero.kick(this.targets[t].x - hx)) this.kickTimer = KICK_COOLDOWN;
    }

    this.balls.update(dt, this.targets, this.onHit);

    this.hurtTimer -= dt;
    if (nearest(this.targets, hx, hy, HURT_DIST) >= 0) this.hurt();
  }

  /** The boss when in range (the weapon locks onto it first), else the nearest enemy. */
  private kickTarget(range: number): number {
    const { x: hx, y: hy } = this.heroPos;
    const b = this.boss?.alive ? this.boss.pos : null;
    if (b && Math.hypot(b.x - hx, b.y - hy) <= range) return this.targets.indexOf(b);
    return nearest(this.targets, hx, hy, range);
  }

  private hurt(): void {
    if (this.hurtTimer > 0) return;
    this.hurtTimer = HURT_COOLDOWN;
    this.hero.hurt();
  }

  /** The kick connects: launch a ball from the hero's foot at the nearest enemy. */
  private strike(): void {
    const { x: hx, y: hy } = this.heroPos;
    const t = this.kickTarget(KICK_RANGE * 1.3);
    const fx = hx + this.hero.facing * 40;
    const tx = t >= 0 ? this.targets[t].x : fx + this.hero.facing * 100;
    const ty = t >= 0 ? this.targets[t].y : hy;
    this.balls.spawn(fx, hy, tx, ty);
  }

  /** A ball hit: jiangshi go down (respawn off-screen), the elite fox is knocked back. */
  private knock(i: number): void {
    const { x: hx, y: hy } = this.heroPos;
    const p = this.targets[i];
    const crit = Math.random() < CRIT_CHANCE;
    const value = (8 + Math.floor(Math.random() * 8)) * (crit ? 3 : 1);
    const fox = p === this.fox.pos;
    if (this.boss && p === this.boss.pos) {
      this.damage.spawn(p.x, p.y - this.boss.hit(value) - 10, value, crit, i);
      return;
    }
    this.damage.spawn(p.x, p.y - (fox ? FOX_HEIGHT : MOB_HEIGHT) - 10, value, crit, fox ? i : -1);
    if (fox) {
      this.fox.view.flinch();
      const d = Math.hypot(p.x - hx, p.y - hy) || 1;
      p.x += ((p.x - hx) / d) * FOX_KNOCKBACK;
      p.y += ((p.y - hy) / d) * FOX_KNOCKBACK;
    } else {
      this.corpses.spawn(this.mobs[i].view, p.x - hx, p.y - hy);
      this.fx.puff(p.x, p.y);
      this.drops.field.drop(p.x, p.y, 1);
      ringPoint(hx, hy, p);
    }
  }

  private drawStick(): void {
    const o = this.stick.origin();
    this.stickBase.visible = this.stickKnob.visible = !!o;
    if (!o) return;
    const v = this.stick.read();
    this.stickBase.position.set(o.x, o.y);
    this.stickKnob.position.set(o.x + v.x * STICK_RADIUS, o.y + v.y * STICK_RADIUS);
  }
}

function place(s: Container, p: Mob): void {
  s.position.set(p.x, p.y);
  s.zIndex = p.y;
}

/** Moves `out` to a random point on a ring around (cx, cy), just outside the phone view. */
/** White at 0, a soft red at 1. */
function hurtTint(k: number): number {
  const gb = Math.round(255 - 130 * k);
  return 0xff0000 | (gb << 8) | gb;
}

function ringPoint(cx: number, cy: number, out: Mob): Mob {
  const a = Math.random() * Math.PI * 2;
  const r = 900 + Math.random() * 500;
  out.x = cx + Math.cos(a) * r;
  out.y = cy + Math.sin(a) * r;
  return out;
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

function makeTiledGround(tex: Texture): TilingSprite {
  const g = new TilingSprite({ texture: tex, width: FIELD * 2, height: FIELD * 2 });
  g.position.set(-FIELD, -FIELD);
  g.tileScale.set(GROUND_SCALE);
  g.zIndex = -Infinity;
  return g;
}

// Rings and the stick are baked into textures with MSAA on the render target: phones run
// without MSAA on the screen, where Graphics edges would come out jagged.

/** A flat ring on the ground around a figure's feet, optionally over a dark outline. */
function makeRing(renderer: Renderer, color: number, size = 1, outline = false): Sprite {
  const rx = 62 * size;
  const ry = 22 * size;
  const g = new Graphics();
  if (outline) g.ellipse(rx + 6, ry + 6, rx, ry).stroke({ color: 0x140c18, width: 11, alpha: 0.6 });
  g.ellipse(rx + 6, ry + 6, rx, ry).stroke({ color, width: 6, alpha: outline ? 1 : 0.8 });
  const s = new Sprite(bake(renderer, g, rx * 2 + 12, ry * 2 + 12, 1));
  s.anchor.set(0.5);
  s.zIndex = SHADOW_Z;
  return s;
}

/** A soft dark glow behind the hero's figure, so he stands out on bright spells. */
function heroBacking(renderer: Renderer): Sprite {
  const w = 90;
  const h = 110;
  const g = new Graphics();
  for (let i = 8; i >= 1; i--) g.ellipse(w, h, (w * i) / 8, (h * i) / 8).fill({ color: 0x140c18, alpha: 0.11 });
  const s = new Sprite(bake(renderer, g, w * 2, h * 2, 1));
  s.anchor.set(0.5);
  // centred on his chest; he is drawn from his feet
  s.y = -HERO_HEIGHT / 2;
  return s;
}

function stickSprites(renderer: Renderer): [Sprite, Sprite] {
  const r = STICK_RADIUS;
  const k = r * 0.45;
  const res = renderer.resolution;
  const base = new Graphics().circle(r + 3, r + 3, r).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ color: 0xffffff, alpha: 0.35, width: 3 });
  const knob = new Graphics().circle(k + 2, k + 2, k).fill({ color: 0xffffff, alpha: 0.4 });
  return [bake(renderer, base, r * 2 + 6, r * 2 + 6, res), bake(renderer, knob, k * 2 + 4, k * 2 + 4, res)].map((t) => {
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.visible = false;
    return s;
  }) as [Sprite, Sprite];
}

function bake(renderer: Renderer, g: Graphics, w: number, h: number, resolution: number): Texture {
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, w, h), resolution, antialias: true });
  g.destroy();
  return tex;
}
