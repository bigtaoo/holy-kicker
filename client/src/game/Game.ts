import { Application, BlurFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import {
  beadsRings, chapterBoss, Engine, EVOLVE, FP, HERO_EASE_LOCKED, HERO_EASE_SMOOTH, isMidBoss, TICK_RATE, WAVES, quantizeMove,
  type MobKind, type RelicId, type RunConfig, type SimEvent, type SimState, type SutraId,
} from '@hk/engine';
import { t } from '../i18n';
import type { Platform } from '../platform/types';
import type { DragStick } from './dragStick';
import { BALL_LIFT, Balls } from './ballView';
import { StaffSwing } from './staffView';
import { FishTaps } from './fishView';
import { BeadsView } from './beadsView';
import { BowlView } from './bowlView';
import { Hero } from './hero';
import { DamageLayer } from './damageView';
import { DropLayer } from './dropView';
import { ThreatLayer } from './threatView';
import { FxLayer } from './fxView';
import { Corpses, type MobLook, type MobSheet } from './mobView';
import { HealthBar } from './healthBar';
import { fakeMobTypes } from './mobTypes';
import { EliteCrowd, EliteView, nearestElite } from './eliteView';
import { BossBar } from './bossBar';
import { wispSheet } from './wispSheet';
import { toadKingSheet, toadSheet, waterGhostSheet } from './marshSheets';
import { HordeView, MOB_HEIGHT } from './hordeView';
import { AuraStack } from './aura';
import { Boss } from './bossView';
import { BossStage } from './bossStage';
import { CarpView } from './carpView';
import { SpellView } from './spellView';
import { SutraView } from './sutraView';
import type { TaoAsset } from './tao/TaoActor';
import { SHADOW_Z, makeShadow, shadowTexture } from './shadow';
import { makeDeco, type DecoSheet } from './decoView';
import type { EliteColor, SceneOptions } from './scene';
import type { LevelSettings } from './quality';
import { computeViewport, type Viewport } from './viewport';
import { LOCKED_CAMERA, SMOOTH_CAMERA, ease, snapToPixel } from './camera';
import { FixedStep, lerpX, lerpY } from './fixedStep';
import { heroBacking, hurtTint, makeGround, makeRing, makeTiledGround, stickSprites } from './stageArt';

// Prototype scene: the hero walks around a field while a horde (jiangshi, foxes and wisps), the
// charging big jiangshi elite and the boss chase him; he auto-kicks the cuju at the nearest enemy.
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
  staff: Texture;
  fish: Texture;
  /** Repeating ground tile; null draws the flat placeholder field. */
  ground: Texture | null;
  /** Scattered ground decorations; null when the scene turns them off. */
  deco: DecoSheet | null;
  /** The boss rig; null when the scene leaves the boss out. */
  boss: TaoAsset | null;
  /** Build icons by item id (relic, spells, passives) for the HUD and the cards. */
  icons: ReadonlyMap<string, Texture>;
}

const HERO_HEIGHT = 120;
export const STICK_RADIUS = 70;
/** Seconds the hero's red hurt flash takes to fade. */
const HURT_FLASH = 0.35;
/** The elite is a big jiangshi. */
const ELITE_HEIGHT = 140;
/** The toad king, chapter 2's elite, squat and wide. */
const TOAD_KING_HEIGHT = 112;
/** Above every mob, below the effects (1e7) and numbers (1e7 + 1). */
const HERO_TOP_Z = 5e6;
const HERO_OVER_FX_Z = 1e7 + 0.5;
const SCREEN_AREA = 1080 * 1920;
const ELITE_RING: Record<EliteColor, number> = { red: 0xe0303a, white: 0xffffff, violet: 0xb04cff };
/** The big jiangshi is a darker steel blue than the horde; the mid-boss's second twin a slate violet. */
const ELITE_TINTS = [0x9fb2d8, 0xb4a6d4];
const DOWN_TINT = 0x8a8a8a;
/** Damage-number keys for elites, by id, clear of the target indices. */
const ELITE_KEY = 1e6;
/** The local player's owner id; online play would get it from the match. */
const LOCAL = 0;

/** What the shell sets a run up with: the chapter and its length (0 for the sandbox), revives, the relic, the sutras. */
export interface RunSetup {
  chapter: number;
  waves: number;
  revives: number;
  relic: RelicId;
  sutras: readonly SutraId[];
}

/** The run a scene sets up: what the engine simulates. */
export function runConfig(scene: SceneOptions, seed: number, setup: RunSetup): RunConfig {
  return {
    seed, players: 1, mobs: scene.mobs, sep: scene.sep, queue: scene.queue,
    heroEase: scene.cam === 'lock' ? HERO_EASE_LOCKED : HERO_EASE_SMOOTH,
    elite: true, boss: scene.boss, threats: scene.threats, spells: scene.spells, spellRate: scene.rate, drops: scene.drops,
    waves: setup.waves, revives: setup.revives, relic: setup.relic, sutras: setup.sutras, chapter: setup.chapter,
  };
}

export class Game {
  readonly engine: Engine;
  private readonly loop = new FixedStep();
  private readonly root = new Container();
  private readonly world = new Container();
  private readonly playMask = new Graphics();
  private readonly label = new Text({ text: '', style: { fill: 0xffffff, fontFamily: 'Arial', stroke: { color: 0x000000, width: 4 } } });
  private readonly hero: Hero;
  /** World point the camera centres on; trails the hero under the smooth camera. */
  private readonly camPos = { x: 0, y: 0 };
  private readonly elites: EliteCrowd | null;
  private readonly horde: HordeView;
  private readonly healthBar = new HealthBar();
  /** A revive to send with the next command (the death screen's ad paid). */
  private reviving = false;
  /** A level-up card to send with the next command. */
  private picking: number | undefined;
  private readonly corpses: Corpses;
  private readonly fx: FxLayer;
  private readonly damage: DamageLayer;
  private readonly drops: DropLayer;
  private readonly threats: ThreatLayer | null;
  private readonly balls: Balls;
  private readonly staff: StaffSwing;
  private readonly fish: FishTaps;
  private readonly beads: BeadsView;
  private readonly bowls: BowlView;
  private readonly boss: BossStage | null;
  private readonly spells: SpellView;
  private readonly sutras: SutraView;
  private readonly aura: AuraStack;
  private readonly stickBase: Sprite;
  private readonly stickKnob: Sprite;
  private hurtFlash = 0;
  private vp: Viewport = computeViewport(1, 1);
  private screenKey = '';
  private fpsTimer = 0;
  private levelName = '';
  /** A paused run neither simulates nor animates; it is still drawn. */
  paused = false;
  private readonly onTick = (t: { deltaMS: number }) => this.frame(t.deltaMS);

  constructor(
    private readonly app: Application,
    private readonly platform: Platform,
    art: Art,
    private readonly scene: SceneOptions,
    /** Bound to the host's input once, by the shell, and shared by every run. */
    private readonly stick: DragStick,
    setup: RunSetup,
  ) {
    const seed = scene.seed || 1 + Math.floor(Math.random() * 0x7ffffffe);
    this.engine = new Engine(runConfig(scene, seed, setup));
    const chapter = setup.waves > 0;
    const s = this.engine.state;
    // dev: skip ahead, so the next tick begins the asked-for wave
    if (chapter && scene.wave > 1) {
      s.wave = Math.min(scene.wave, setup.waves) - 1;
      s.waveT = WAVES.ticks - 1;
    }

    this.world.sortableChildren = true;
    this.world.addChild(art.ground ? makeTiledGround(art.ground) : makeGround());
    if (art.deco && scene.deco !== 'none') {
      const deco = makeDeco(art.deco, scene.deco === 'props');
      deco.zIndex = SHADOW_Z - 1;
      this.world.addChild(deco);
    }
    const shadowTex = shadowTexture(app.renderer);
    this.hero = new Hero(art.hero, HERO_HEIGHT);
    this.world.addChild(makeShadow(shadowTex, 34, 11), this.hero.view, this.healthBar.view);
    this.healthBar.view.visible = chapter;
    if (scene.ring) this.hero.view.addChildAt(makeRing(app.renderer, 0xffb030), 0);
    if (scene.heroBack) this.hero.view.addChildAt(heroBacking(app.renderer, HERO_HEIGHT), 0);
    this.balls = new Balls(this.world, art.cuju, shadowTex);
    // the crescent draws over the horde, under the elite
    this.staff = new StaffSwing(this.world, art.staff, HERO_TOP_Z - 3);
    this.fish = new FishTaps(this.world, art.fish, HERO_TOP_Z - 3);
    this.beads = new BeadsView(app.renderer, this.world);
    this.bowls = new BowlView(app.renderer, this.world, shadowTex);
    this.sutras = new SutraView(app.renderer, this.world, HERO_TOP_Z - 3);
    this.corpses = new Corpses(this.world);
    this.fx = new FxLayer(app.renderer);
    this.damage = new DamageLayer(app.renderer, scene.crit, scene.numFade);
    this.world.addChild(this.fx.view, this.damage.view);
    this.drops = new DropLayer(app.renderer, this.world, scene.gem, this.fx.pool);
    // a chapter's shooters fire bullets
    this.threats = scene.threats || chapter
      ? new ThreatLayer(app.renderer, this.world, scene.bullet, scene.zone, scene.zoneLayer, this.fx.pool)
      : null;
    const jiangshi = fakeMobTypes(app.renderer, art.jiangshi, scene.types, scene.page, scene.mobRes);
    const look = (sheet: MobSheet, kind: MobKind, facesLeft: boolean, shadow: [number, number]): MobLook => (
      { sheet, height: MOB_HEIGHT[kind], facesLeft, shadow, shadowTex }
    );
    // chapter 2 on brings water ghosts and toads (CHAPTER_MOBS); the marsh's walkers are water ghosts too
    const ghost = setup.chapter >= 2 ? waterGhostSheet(app.renderer) : null;
    this.horde = new HordeView(this.world, {
      chaser: ghost && setup.chapter === 2 ? [look(ghost, 'chaser', true, [27, 9])] : jiangshi.map((sheet) => look(sheet, 'chaser', true, [27, 9])),
      runner: [look(art.fox, 'runner', false, [36, 9])],
      swarm: [look(wispSheet(app.renderer), 'swarm', true, [18, 6])],
      emerger: ghost ? [look(ghost, 'emerger', true, [27, 9])] : [],
      shooter: setup.chapter >= 2 ? [look(toadSheet(app.renderer), 'shooter', true, [34, 10])] : [],
    }, scene, this.fx.pool);
    // in a chapter the elite and boss arrive later, so their views wait hidden
    this.elites = null;
    if (s.elites.length > 0 || chapter) {
      const big = { sheet: art.jiangshi, height: ELITE_HEIGHT, facesLeft: true, shadow: [46, 14] as [number, number], shadowTex };
      const king = setup.chapter >= 2 ? { sheet: toadKingSheet(app.renderer), height: TOAD_KING_HEIGHT, facesLeft: true, shadow: [52, 15] as [number, number], shadowTex } : big;
      this.elites = new EliteCrowd((k, kind) => new EliteView(
        kind, this.world, kind === 'toadKing' ? king : big, makeRing(app.renderer, ELITE_RING[scene.eliteColor], 1.8, scene.eliteColor !== 'red'),
        kind === 'toadKing' ? 0xffffff : ELITE_TINTS[k % ELITE_TINTS.length], scene.eliteRing, HERO_TOP_Z,
      ), chapter ? new BossBar(t('boss.twins')) : null);
    }
    // chapter 2 on ends with the Black Carp King (CHAPTER_BOSSES); the abbot is still its mid-boss
    const abbot = art.boss && (s.boss || chapter) ? new Boss(app.renderer, this.world, art.boss, shadowTex, scene.bossSize, this.fx.pool) : null;
    const carp = chapter && chapterBoss(setup.chapter) === 'carp' ? new CarpView(app.renderer, this.world, shadowTex, scene.bossSize, this.fx.pool) : null;
    this.boss = abbot || carp ? new BossStage(abbot, carp) : null;
    // like the elite, the boss draws over the horde
    if (this.boss && scene.eliteRing) this.boss.setZ(HERO_TOP_Z - 1);
    if (scene.blur) this.fx.view.filters = [new BlurFilter({ strength: 6, quality: 2 })];
    this.spells = new SpellView(app.renderer, this.world, this.fx.pool, scene.ringFx);
    this.aura = new AuraStack(scene.stack);

    this.root.addChild(this.world, this.label);
    if (this.boss) this.root.addChild(...this.boss.huds);
    if (this.elites?.bar) this.root.addChild(this.elites.bar.view);
    this.root.mask = this.playMask;
    [this.stickBase, this.stickKnob] = stickSprites(app.renderer, STICK_RADIUS);
    app.stage.addChild(this.playMask, this.root, this.stickBase, this.stickKnob);

    // the fps / tick readout is for development only
    this.label.visible = import.meta.env.DEV;
    app.ticker.add(this.onTick);
  }

  /** Removes the run from the stage. Shared art textures stay loaded for the next run. */
  destroy(): void {
    this.app.ticker.remove(this.onTick);
    this.app.stage.removeChild(this.playMask, this.root, this.stickBase, this.stickKnob);
    for (const c of [this.playMask, this.root, this.stickBase, this.stickKnob]) c.destroy({ children: true });
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
    // under the HUD's experience bar
    // dev only, below the HUD strip, the wave counter and the boss bar
    this.label.position.set(24 * vp.scale, 460 * vp.scale);
    this.boss?.layout(vp.playW, vp.scale);
    this.elites?.bar?.layout(vp.playW, vp.scale);
  }

  /** Brings the downed hero back on the next tick (the engine checks he has a revive left). */
  revive(): void {
    this.reviving = true;
  }

  /** Takes card `index` of the open level-up offer on the next tick. */
  pick(index: number): void {
    this.picking = index;
  }

  private frame(frameMs: number): void {
    this.layout();
    // a finished run (won, or lost until a revive) and an open level-up are drawn but not
    // stepped, until the command that resumes them is ready
    const s = this.engine.state;
    const over = (s.outcome !== 'playing' && !this.reviving) || (s.players[0].offer.length > 0 && this.picking === undefined);
    if (this.paused || over) {
      this.draw(this.loop.alpha, 0);
      return;
    }
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
    const revive = this.reviving;
    const pick = this.picking;
    this.reviving = false;
    this.picking = undefined;
    return { owner: LOCAL, tick: this.engine.nextTick, ...quantizeMove(s.x + k.x, s.y + k.y), revive, pick };
  }

  /** One tick's events: animations, effects and numbers. Positions arrive in FP. */
  private react(events: readonly SimEvent[]): void {
    const s = this.engine.state;
    for (const e of events) {
      switch (e.type) {
        case 'kick':
          if (e.owner === LOCAL) this.hero.kick(s.players[0].relicId !== 'ball');
          break;
        case 'sweep': {
          const p = s.players.find((q) => q.owner === e.owner);
          if (e.owner === LOCAL && p) this.staff.swing(e.brad, e.reach / FP, e.full, p.facing);
          break;
        }
        case 'ring': {
          const p = s.players.find((q) => q.owner === e.owner);
          if (e.owner === LOCAL && p) this.fish.tap(e.x / FP, e.y / FP, e.reach / FP, e.stun, p.facing);
          break;
        }
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
            // the elite hit is the one standing nearest the hit (one in front may have fallen since)
            const hit = nearestElite(s.elites, e.x, e.y);
            if (hit) this.elites?.byId(hit.id)?.mob.flinch();
            this.damage.spawn(x, y - ELITE_HEIGHT - 10, e.value, e.crit, ELITE_KEY + (hit?.id ?? 0));
          } else {
            this.horde.at(e.index)?.flinch();
            this.damage.spawn(x, y - MOB_HEIGHT[s.mobs[e.index]?.kind ?? 'chaser'] - 10, e.value, e.crit);
          }
          break;
        }
        case 'eliteDown':
          {
            const v = this.elites?.byId(e.id);
            if (v) this.corpses.spawn(v.mob, 0, -1);
          }
          this.fx.puff(e.x / FP, e.y / FP);
          break;
        case 'mobDown':
          {
            const v = this.horde.at(e.index);
            if (v) this.corpses.spawn(v, e.dx, e.dy);
          }
          this.fx.puff(e.x / FP, e.y / FP);
          break;
        case 'emerge':
          this.horde.emerge(e.x / FP, e.y / FP);
          break;
        case 'bossDive':
          if (s.boss) this.boss?.dive(s.boss, e.x / FP, e.y / FP);
          break;
        case 'bossWindup':
          if (s.boss) this.boss?.windup(s.boss);
          break;
        case 'bossSlam':
          if (s.boss) this.boss?.impact(s.boss, e.x / FP, e.y / FP, e.radius / FP);
          break;
        case 'bossDown':
          if (s.boss) this.boss?.down(s.boss);
          break;
        case 'bossBack':
          if (s.boss) this.boss?.back(s.boss);
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
        case 'bloom':
          this.sutras.bloom(e.x / FP, e.y / FP, e.radius / FP);
          break;
        case 'roar':
          this.sutras.roar(e.x / FP, e.y / FP, e.brad, e.radius / FP, e.full);
          break;
        case 'bellUp':
          if (e.owner === LOCAL) this.spells.bellUp();
          break;
        case 'bellBreak':
          if (e.owner === LOCAL && s.players[0].spells.some((sp) => sp.id === 'bell' && sp.evolved)) {
            this.spells.guard(EVOLVE.bellGuard / TICK_RATE);
          }
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
    // a downed hero lies greyed out until revived
    this.hero.view.tint = p.dead ? DOWN_TINT : hurtTint(this.hurtFlash / HURT_FLASH);
    this.hero.view.alpha = p.dead ? 0.6 : 1;
    this.healthBar.update(dt, p.hp, p.maxHp);
    this.healthBar.view.position.set(hx, hy + 22);
    this.healthBar.view.zIndex = this.hero.view.zIndex + 0.25;

    this.drawHorde(s, alpha, dt, hx, hy);
    this.corpses.update(dt);
    this.balls.sync(s.balls, alpha, dt);
    this.bowls.sync(s.bowls, alpha, dt);
    this.staff.update(dt, hx, hy, this.hero.view.zIndex);
    this.fish.update(dt, hx, hy, this.hero.view.zIndex);
    this.beads.draw(s.beads, p.relicId === 'beads' && !p.dead ? beadsRings(p) : [], alpha, hx, hy, this.hero.view.zIndex);
    this.spells.drawFields(s.fields, alpha, dt);
    this.spells.drawCymbals(s.cymbals, alpha, dt);
    this.sutras.draw(s.lotuses, p, alpha, dt, hx, hy);
    this.spells.drawBell(p.bell && !p.dead, hx, hy, this.hero.view.zIndex, dt);
    this.aura.update(dt, hx, hy, this.fx.pool);
    this.fx.update(dt, this.aura.parts);
    this.damage.update(dt, hx, hy);
    this.drops.draw(s.gems, alpha);
    this.threats?.draw(s.bullets, s.zones, alpha);
    this.boss?.draw(s.boss, alpha, dt, hx);

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
Lv ${p.level}  xp ${p.xp}  gems ${s.gems.length}  tick ${s.tick}`;
    }
  }

  private drawHorde(s: SimState, alpha: number, dt: number, hx: number, hy: number): void {
    this.horde.draw(s.mobs, alpha, dt, hx, hy);
    this.elites?.draw(s.elites, alpha, dt, hx, hy, isMidBoss(s.wave, s.config.waves), WAVES.twinHp * 2);
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
