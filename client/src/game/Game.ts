import { Application, BlurFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import {
  Engine, FP, HERO_EASE_LOCKED, HERO_EASE_SMOOTH, HORDE, ELITE, TICK_RATE, quantizeMove,
  type RunConfig, type SimEvent, type SimState,
} from '@hk/engine';
import type { Platform } from '../platform/types';
import { DragStick } from './dragStick';
import { BALL_LIFT, Balls } from './ballView';
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
import { SpellView } from './spellView';
import type { TaoAsset } from './tao/TaoActor';
import { SHADOW_Z, makeShadow, shadowTexture } from './shadow';
import { makeDeco, type DecoSheet } from './decoView';
import type { EliteColor, SceneOptions } from './scene';
import type { LevelSettings } from './quality';
import { computeViewport, type Viewport } from './viewport';
import { LOCKED_CAMERA, SMOOTH_CAMERA, ease, snapToPixel } from './camera';
import { FixedStep, lerpX, lerpY } from './fixedStep';
import { heroBacking, hurtTint, makeGround, makeRing, makeTiledGround, stickSprites } from './stageArt';

// Prototype scene: the hero walks around a field while a jiangshi horde, a fox elite and the
// boss chase him; he auto-kicks the cuju at the nearest enemy.
//
// Logic and drawing are split. The engine (@hk/engine) runs the game at a fixed 30 Hz on
// integer state, fed only by stick commands, so a run is reproducible from its seed and inputs
// and can later run in lockstep online. This class turns the screen's frames into sim ticks
// (FixedStep), draws every sim body interpolated between its last two tick positions, and
// turns the sim's events into animations, effects and numbers.

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

const HERO_HEIGHT = 120;
const STICK_RADIUS = 70;
/** Seconds the hero's red hurt flash takes to fade. */
const HURT_FLASH = 0.35;
const MOB_HEIGHT = 80;
const FOX_HEIGHT = 130;
/** World units per second, for the mobs' walk cycle pacing. */
const MOB_WALK = (HORDE.speed * TICK_RATE) / FP;
const FOX_STOP = ELITE.stopDist / FP;
/** Above every mob, below the effects (1e7) and numbers (1e7 + 1). */
const HERO_TOP_Z = 5e6;
const HERO_OVER_FX_Z = 1e7 + 0.5;
const SCREEN_AREA = 1080 * 1920;
const ELITE_RING: Record<EliteColor, number> = { red: 0xe0303a, white: 0xffffff, violet: 0xb04cff };
const FOX_TINT = 0xc8a8ff;
/** The local player's owner id; online play would get it from the match. */
const LOCAL = 0;

/** The run a scene sets up: what the engine simulates. */
export function runConfig(scene: SceneOptions, seed: number): RunConfig {
  return {
    seed, players: 1, mobs: scene.mobs, sep: scene.sep, queue: scene.queue,
    heroEase: scene.cam === 'lock' ? HERO_EASE_LOCKED : HERO_EASE_SMOOTH,
    elite: true, boss: scene.boss, threats: scene.threats, spells: scene.spells, spellRate: scene.rate, drops: scene.drops,
  };
}

export class Game {
  readonly engine: Engine;
  private readonly loop = new FixedStep();
  private readonly stick = new DragStick(STICK_RADIUS);
  private readonly root = new Container();
  private readonly world = new Container();
  private readonly playMask = new Graphics();
  private readonly label = new Text({ text: '', style: { fill: 0xffffff, fontFamily: 'Arial', stroke: { color: 0x000000, width: 4 } } });
  private readonly hero: Hero;
  /** World point the camera centres on; trails the hero under the smooth camera. */
  private readonly camPos = { x: 0, y: 0 };
  private readonly fox: MobView | null;
  private readonly foxRing: Sprite;
  private readonly mobs: MobView[] = [];
  private readonly corpses: Corpses;
  private readonly fx: FxLayer;
  private readonly damage: DamageLayer;
  private readonly drops: DropLayer;
  private readonly threats: ThreatLayer | null;
  private readonly balls: Balls;
  private readonly boss: Boss | null;
  private readonly spells: SpellView;
  private readonly aura: AuraStack;
  private readonly stickBase: Sprite;
  private readonly stickKnob: Sprite;
  private hurtFlash = 0;
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
    const seed = scene.seed || 1 + Math.floor(Math.random() * 0x7ffffffe);
    this.engine = new Engine(runConfig(scene, seed));
    const s = this.engine.state;

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
    if (scene.heroBack) this.hero.view.addChildAt(heroBacking(app.renderer, HERO_HEIGHT), 0);
    this.foxRing = makeRing(app.renderer, ELITE_RING[scene.eliteColor], 1.8, scene.eliteColor !== 'red');
    this.balls = new Balls(this.world, art.cuju, shadowTex);
    this.corpses = new Corpses(this.world);
    this.fx = new FxLayer(app.renderer);
    this.damage = new DamageLayer(app.renderer, scene.crit, scene.numFade);
    this.world.addChild(this.fx.view, this.damage.view);
    this.drops = new DropLayer(app.renderer, this.world, scene.gem, this.fx.pool);
    this.threats = scene.threats
      ? new ThreatLayer(app.renderer, this.world, scene.bullet, scene.zone, scene.zoneLayer, this.fx.pool)
      : null;
    this.fox = null;
    if (s.elite) {
      const look = { sheet: art.fox, height: FOX_HEIGHT, facesLeft: false, shadow: [62, 15] as [number, number], shadowTex };
      this.fox = new MobView(look, this.world);
      // a multiply tint is free: it turns the pale fox lavender, away from the teal horde
      if (scene.foxTint) this.fox.sprite.tint = FOX_TINT;
      if (scene.eliteRing) {
        // the elite and its ring draw over the horde, just under the hero
        this.world.addChild(this.foxRing);
        this.fox.sprite.zIndex = HERO_TOP_Z - 1;
        this.foxRing.zIndex = HERO_TOP_Z - 2;
      }
    }
    const looks = fakeMobTypes(app.renderer, art.jiangshi, scene.types, scene.page, scene.mobRes).map((sheet) => (
      { sheet, height: MOB_HEIGHT, facesLeft: true, shadow: [27, 9] as [number, number], shadowTex }
    ));
    for (let i = 0; i < s.mobs.length; i++) this.mobs.push(new MobView(looks[i % looks.length], this.world, scene.calm));
    this.boss = art.boss && s.boss ? new Boss(app.renderer, this.world, art.boss, shadowTex, scene.bossSize, this.fx.pool) : null;
    // like the elite, the boss draws over the horde
    if (this.boss && scene.eliteRing) this.boss.view.zIndex = HERO_TOP_Z - 1;
    if (scene.blur) this.fx.view.filters = [new BlurFilter({ strength: 6, quality: 2 })];
    this.spells = new SpellView(app.renderer, this.world, this.fx.pool, scene.ringFx);
    this.aura = new AuraStack(scene.stack);

    this.root.addChild(this.world, this.label);
    if (this.boss) this.root.addChild(this.boss.hud);
    this.root.mask = this.playMask;
    [this.stickBase, this.stickKnob] = stickSprites(app.renderer, STICK_RADIUS);
    app.stage.addChild(this.playMask, this.root, this.stickBase, this.stickKnob);

    platform.bindStick(app, this.stick);
    app.ticker.add((t) => this.frame(t.deltaMS));
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

  private frame(frameMs: number): void {
    this.layout();
    const steps = this.loop.advance(frameMs);
    for (let i = 0; i < steps; i++) {
      this.engine.submit(this.command());
      const events = this.engine.advance();
      // null only while a network input source waits for the server; never offline
      if (!events) break;
      this.react(events);
    }
    this.draw(this.loop.alpha, Math.min(frameMs / 1000, 0.05));
  }

  /** The local stick (and keys) for the next tick, quantized at the input edge. */
  private command() {
    const s = this.stick.read();
    const k = this.platform.readKeys();
    return { owner: LOCAL, tick: this.engine.nextTick, ...quantizeMove(s.x + k.x, s.y + k.y) };
  }

  /** One tick's events: animations, effects and numbers. Positions arrive in FP. */
  private react(events: readonly SimEvent[]): void {
    const s = this.engine.state;
    for (const e of events) {
      switch (e.type) {
        case 'kick':
          if (e.owner === LOCAL) this.hero.kick();
          break;
        case 'hurt':
          if (e.owner === LOCAL) {
            this.hero.hurt();
            this.hurtFlash = HURT_FLASH;
          }
          break;
        case 'hit': {
          if (e.ball) this.fx.hit(e.bx / FP, e.by / FP - BALL_LIFT);
          const x = e.x / FP;
          const y = e.y / FP;
          if (e.kind === 'boss' && this.boss && s.boss) {
            this.damage.spawn(x, y - this.boss.hit(s.boss) - 10, e.value, e.crit, e.index);
          } else if (e.kind === 'elite') {
            this.fox?.flinch();
            this.damage.spawn(x, y - FOX_HEIGHT - 10, e.value, e.crit, e.index);
          } else {
            this.damage.spawn(x, y - MOB_HEIGHT - 10, e.value, e.crit);
          }
          break;
        }
        case 'mobDown':
          this.corpses.spawn(this.mobs[e.index], e.dx, e.dy);
          this.fx.puff(e.x / FP, e.y / FP);
          break;
        case 'bossWindup':
          if (s.boss) this.boss?.windup(s.boss);
          break;
        case 'bossSlam':
          this.boss?.impact(e.x / FP, e.y / FP, e.radius / FP);
          break;
        case 'bossDown':
          if (s.boss) this.boss?.down(s.boss);
          break;
        case 'bossBack':
          this.boss?.back();
          break;
        case 'blast':
          this.threats?.blast(e.x / FP, e.y / FP, e.radius / FP);
          break;
        case 'pickup': {
          const p = s.players.find((q) => q.owner === e.owner);
          if (p && e.owner === LOCAL) this.drops.pickup(p.x / FP, p.y / FP, e.tier);
          break;
        }
        case 'cast':
          this.spells.cast(e.kind, e.x / FP, e.y / FP, e.radius / FP);
          break;
        case 'bolt':
          this.spells.bolt(e.x0 / FP, e.y0 / FP, e.x1 / FP, e.y1 / FP);
          break;
      }
    }
  }

  /** Draws the sim state `alpha` of the way through its last tick; dt is the frame time. */
  private draw(alpha: number, dt: number): void {
    const s = this.engine.state;
    const p = s.players[0];
    const hx = lerpX(p, alpha);
    const hy = lerpY(p, alpha);
    this.hero.update(dt, p.facing, p.moving);
    this.hero.view.position.set(hx, hy);
    this.hero.view.zIndex = this.scene.heroOnTop ? (this.scene.heroOverFx ? HERO_OVER_FX_Z : HERO_TOP_Z) : hy;
    // a red flash that fades, not a see-through blink: a 10 Hz strobe over the crowd is tiring
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.hero.view.tint = hurtTint(this.hurtFlash / HURT_FLASH);

    this.drawHorde(s, alpha, dt, hx, hy);
    this.corpses.update(dt);
    this.balls.sync(s.balls, alpha, dt);
    this.spells.drawFields(s.fields, alpha, dt);
    this.aura.update(dt, hx, hy, this.fx.pool);
    this.fx.update(dt, this.aura.parts);
    this.damage.update(dt, hx, hy);
    this.drops.draw(s.gems, alpha);
    this.threats?.draw(s.bullets, s.zones, alpha);
    if (this.boss && s.boss) this.boss.draw(s.boss, alpha, dt, hx);

    // Camera: ease after the hero towards the centre of the play area, on whole pixels.
    const vp = this.vp;
    ease(this.camPos, hx, hy, dt, (this.scene.cam === 'lock' ? LOCKED_CAMERA : SMOOTH_CAMERA).camEase);
    const res = this.app.renderer.resolution;
    this.world.position.set(
      snapToPixel(vp.playW / 2 - this.camPos.x * vp.scale, res),
      snapToPixel(vp.playH / 2 - this.camPos.y * vp.scale, res),
    );

    this.drawStick();
    this.fpsTimer -= dt;
    if (this.fpsTimer <= 0) {
      this.fpsTimer = 0.5;
      this.label.text = `Holy Kicker  ${Math.round(this.app.ticker.FPS)} fps  ${this.levelName}
xp ${p.xp}  gems ${s.gems.length}  tick ${s.tick}`;
    }
  }

  private drawHorde(s: SimState, alpha: number, dt: number, hx: number, hy: number): void {
    for (let i = 0; i < this.mobs.length; i++) {
      const m = s.mobs[i];
      const x = lerpX(m, alpha);
      const y = lerpY(m, alpha);
      const v = this.mobs[i];
      v.update(dt, x, y, hx - x, 1, this.scene.settle ? MOB_WALK : 0, this.scene.sway);
      if (this.scene.calm) v.shade(depthShade(Math.hypot(x - hx, y - hy)));
    }
    if (this.fox && s.elite) {
      const x = lerpX(s.elite, alpha);
      const y = lerpY(s.elite, alpha);
      const running = Math.hypot(x - hx, y - hy) > FOX_STOP + 5;
      this.fox.update(dt, x, y, hx - x, running ? 1 : 0.35);
      this.foxRing.position.set(x, y);
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
