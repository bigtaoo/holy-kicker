import { Application, BlurFilter, Container, Graphics, Sprite, Text } from 'pixi.js';
import { beadsRings, Engine, EVOLVE, FP, inZen, isMidBoss, mapOf, TICK_RATE, twinHp, quantizeMove, startAt, type MonkId, type SimEvent, type SimState } from '@hk/engine';
import type { Platform } from '../platform/types';
import type { DragStick } from './dragStick';
import { Balls } from './ballView';
import { StaffSwing } from './staffView';
import { FishTaps } from './fishView';
import { BeadsView } from './beadsView';
import { BowlView } from './bowlView';
import { makeHero, type HeroView } from './heroes';
import { DamageLayer } from './damageView';
import { DropLayer } from './dropView';
import { ThreatLayer } from './threatView';
import { FxLayer } from './fxView';
import { Corpses } from './mobView';
import { HealthBar, starMarkAt } from './healthBar';
import { blockFx, howlFx, nearestElite, type EliteCrowd } from './eliteView';
import { HordeView } from './hordeView';
import { guardAlpha } from './guardPulse';
import { HitFeedback } from './hitFeedback';
import { AuraStack } from './aura';
import { ZenRing } from './zenView';
import type { BossStage } from './bossStage';
import { hordeLooks, makeBosses, makeElites } from './cast';
import { summonFx } from './witchView';
import { SpellView } from './spellView';
import { ArsenalView } from './arsenalView';
import { learnSpells } from '../dev/learn';
import { SutraView } from './sutraView';
import { SHADOW_Z, makeShadow, shadowTexture } from './shadow';
import { makeDeco } from './decoView';
import { Mist } from './mistView';
import type { SceneOptions } from './scene';
import type { LevelSettings } from './quality';
import { computeViewport, type Viewport } from './viewport';
import { Autoplay, RUSH_SPEED } from './autoplay';
import { LOCKED_CAMERA, SMOOTH_CAMERA, ease, snapToPixel } from './camera';
import { Shake } from './shake';
import { FixedStep, lerpX, lerpY } from './fixedStep';
import { releaseBaked } from './bake';
import { KillCamView } from './killCamView';
import { LowHealthView } from './lowHealthView';
import { runConfig, runSeed, type RunSetup } from './runSetup';
import { monkRig, type Art } from './artTypes';
import { frameWork } from './frameWork';
import { drawStick, heroBacking, hurtTint, makeRing, nightTint, sideGround, stageGround, stickSprites } from './stageArt';
import { sortSteadily } from './steadySort';

// Prototype scene: the hero walks around a field while a horde (jiangshi, foxes and wisps), the
// charging big jiangshi elite and the boss chase him; he auto-kicks the cuju at the nearest enemy.
//
// Logic and drawing are split. The engine (@hk/engine) runs the game at a fixed 30 Hz on
// integer state, fed only by stick commands, so a run is reproducible from its seed and inputs
// and can later run in lockstep online. This class turns the screen's frames into sim ticks
// (FixedStep), draws every sim body interpolated between its last two tick positions, and
// turns the sim's events into animations, effects and numbers.

export type { Art, GhostArt, PeakArt } from './artTypes';

const HERO_HEIGHT = 120;
/** Each monk's height, percent of HERO_HEIGHT: the novice is a small boy. */
const MONK_HEIGHT: Record<MonkId, number> = { kicker: 100, fat: 100, novice: 88 };
export const STICK_RADIUS = 70;
/** Seconds the hero's red hurt flash takes to fade. */
const HURT_FLASH = 0.35;
/** Above every mob, below the effects (1e7) and numbers (1e7 + 1). */
const HERO_TOP_Z = 5e6;
const HERO_OVER_FX_Z = 1e7 + 0.5;
const SCREEN_AREA = 1080 * 1920;
const DOWN_TINT = 0x8a8a8a;
/** The local player's owner id; online play would get it from the match. */
const LOCAL = 0;

export class Game {
  readonly engine: Engine;
  /** Goes on from a restored state, so the input history lacks the ticks before it (no replay). */
  readonly resumed: boolean;
  private readonly loop = new FixedStep();
  private readonly root = new Container();
  private readonly world = new Container();
  private readonly playMask = new Graphics();
  private readonly sides: Container;
  private readonly label = new Text({ text: '', style: { fill: 0xffffff, fontFamily: 'Arial', stroke: { color: 0x000000, width: 4 } } });
  private readonly hero: HeroView;
  /** World point the camera centres on; trails the hero under the smooth camera. */
  private readonly camPos = { x: 0, y: 0 };
  readonly shake = new Shake(); // the shell turns it off for players who set it so
  private readonly elites: EliteCrowd | null;
  private readonly horde: HordeView;
  private readonly mist: Mist | null;
  private readonly healthBar: HealthBar;
  private reviving = false; // a revive to send with the next command (the death screen's ad paid)
  private picking: number | undefined; // a level-up card to send with the next command
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
  private readonly feedback: HitFeedback;
  private readonly arsenal: ArsenalView;
  private readonly spells: SpellView;
  private readonly sutras: SutraView;
  private readonly aura: AuraStack;
  private readonly zen: ZenRing;
  private readonly stickBase: Sprite;
  private readonly stickKnob: Sprite;
  private hurtFlash = 0;
  /** The slow-motion look at the killing blow, and the low-health heartbeat. */
  private readonly downCam: KillCamView;
  private readonly lowHp: LowHealthView;
  /** Every tick's events after the view reacted, for the shell (sounds). */
  onEvents: (events: readonly SimEvent[]) => void = () => {};
  /** Each beat of the low-health heartbeat, for the shell (its sound). */
  onHeartbeat: () => void = () => {};
  private vp: Viewport = computeViewport(1, 1);
  private screenKey = '';
  private fpsTimer = 0;
  private levelName = '';
  paused = false; // a paused run neither simulates nor animates; it is still drawn
  /** Watching a replay (ui/replayWatch.ts) up to this tick: offers do not wait, and it stops there; 0 for a run in play. */
  watchEnd = 0;
  /** Whether the last frame stepped the sim: false while paused, on an open offer or once over. */
  stepping = false;
  speed = 1; // sim time per real time: 2 fast-forwards the run (ticks and animations), 1 is normal
  private readonly onTick = (t: { deltaMS: number }, start = performance.now()) => (this.frame(t.deltaMS), (frameWork.run += performance.now() - start));
  /** Dev: the bot playing instead of the stick (?autoplay). */
  private readonly autoplay: Autoplay | null;

  constructor(
    private readonly app: Application,
    private readonly platform: Platform,
    art: Art,
    private readonly scene: SceneOptions,
    /** Bound to the host's input once, by the shell, and shared by every run. */
    private readonly stick: DragStick,
    setup: RunSetup,
    /** A run left unfinished, to go on with (meta/resume.ts; `setup` must match its config), or a replay's engine to watch. */
    restored?: SimState | Engine,
  ) {
    const from = restored instanceof Engine ? restored.state : restored;
    const seed = from?.config.seed ?? runSeed(scene, setup);
    this.engine = restored instanceof Engine ? restored : new Engine(from?.config ?? runConfig(scene, seed, setup), undefined, from);
    this.resumed = !!restored;
    this.autoplay = scene.autoplay ? new Autoplay(LOCAL, seed, scene.from) : null;
    const chapter = setup.waves > 0;
    const s = this.engine.state;
    // dev: skip ahead, so the next tick begins the asked-for wave
    if (chapter && scene.wave > 1 && !restored) startAt(s, Math.min(scene.wave, setup.waves));
    if (scene.learn && !restored) learnSpells(s, scene.learn);
    Object.assign(this.camPos, { x: lerpX(s.players[0], 1), y: lerpY(s.players[0], 1) }); // a resumed or sought run opens on its hero

    sortSteadily(this.world);
    const stageNo = Math.min(mapOf(setup.chapter), art.stages.length);
    const stage = art.stages[stageNo - 1];
    this.world.addChild(stageGround(stage.ground, this.camPos, setup.chapter));
    if (stage.deco && scene.deco !== 'none') {
      const deco = makeDeco(stage.deco, scene.deco === 'props', stage.style, this.camPos, () => this.hero.view.position, nightTint(setup.chapter));
      this.world.addChild(deco).zIndex = SHADOW_Z - 1;
    }
    this.mist = stage.mist && scene.mist ? new Mist(app.renderer, stage.mist, this.camPos) : null;
    if (this.mist) this.world.addChild(this.mist.view);
    const shadowTex = shadowTexture(app.renderer);
    const monk = setup.monk ?? 'kicker';
    this.hero = makeHero(monkRig(art, monk), Math.round((HERO_HEIGHT * MONK_HEIGHT[monk]) / 100));
    this.healthBar = new HealthBar(starMarkAt(setup));
    this.world.addChild(makeShadow(shadowTex, 34, 11), this.hero.view, this.healthBar.view);
    this.healthBar.view.visible = chapter;
    if (scene.ring) this.hero.view.addChildAt(makeRing(app.renderer, 0xffb030), 0);
    if (scene.heroBack) this.hero.view.addChildAt(heroBacking(app.renderer, HERO_HEIGHT), 0);
    this.balls = new Balls(this.world, art.cuju, art.awakened.meteor, shadowTex);
    // the crescent draws over the horde, under the elite
    this.staff = new StaffSwing(this.world, art.staff, art.awakened.ruyi, HERO_TOP_Z - 3);
    this.fish = new FishTaps(this.world, this.hero.held, art.fish, art.awakened.bell, HERO_TOP_Z - 3);
    this.beads = new BeadsView(app.renderer, this.world);
    this.bowls = new BowlView(app.renderer, this.world, shadowTex);
    this.sutras = new SutraView(app.renderer, this.world, HERO_TOP_Z - 3, art.awakened.lion);
    this.corpses = new Corpses(this.world);
    this.fx = new FxLayer(app.renderer);
    this.damage = new DamageLayer(app.renderer, scene.crit, scene.numFade);
    this.world.addChild(this.fx.view, this.damage.view);
    this.drops = new DropLayer(app.renderer, this.world, scene.gem, this.fx.pool);
    // a chapter's shooters fire bullets
    this.threats = scene.threats || chapter
      ? new ThreatLayer(app.renderer, this.world, scene.bullet, scene.zone, scene.zoneLayer, this.fx.pool)
      : null;
    this.horde = new HordeView(this.world, hordeLooks(app.renderer, art, scene, setup.chapter, shadowTex), scene, this.fx.pool);
    // in a chapter the elite and boss arrive later, so their views wait hidden
    this.elites = s.elites.length > 0 || chapter ? makeElites(app.renderer, this.world, art, scene, chapter, shadowTex, HERO_TOP_Z) : null;
    this.boss = makeBosses(app.renderer, this.world, art, scene, chapter ? setup.chapter : 0, !!s.boss, shadowTex, this.fx.pool);
    const { fx, damage, shake, horde, elites, boss, corpses, balls, staff, fish, beads, bowls } = this;
    this.feedback = new HitFeedback({ fx, damage, shake, horde, elites, boss, corpses, balls, staff, fish, beads, bowls });
    // like the elite, the boss draws over the horde
    if (this.boss && scene.eliteRing) this.boss.setZ(HERO_TOP_Z - 1);
    if (scene.blur) this.fx.view.filters = [new BlurFilter({ strength: 6, quality: 2 })];
    this.spells = new SpellView(app.renderer, this.world, this.fx.pool, scene.ringFx, { tex: art.palm, mountain: art.mountain, z: HERO_TOP_Z - 2 });
    this.arsenal = new ArsenalView(app.renderer, this.world, this.fx.pool, scene.ringFx, art.icons);
    this.aura = new AuraStack(scene.stack);
    this.zen = new ZenRing(this.world);
    this.downCam = new KillCamView(this.world, { hero: this.hero.view, horde: this.horde, elites: this.elites, boss: this.boss }, this.shake);
    this.lowHp = new LowHealthView(app.renderer, () => this.onHeartbeat());

    this.root.addChild(this.world, this.label);
    if (this.boss) this.root.addChild(...this.boss.huds);
    if (this.elites?.bar) this.root.addChild(this.elites.bar.view);
    this.root.mask = this.playMask;
    [this.stickBase, this.stickKnob] = stickSprites(app.renderer, STICK_RADIUS);
    this.sides = sideGround(stage.ground, app.screen, this.root, this.world, setup.chapter);
    app.stage.addChild(this.sides, this.playMask, this.root, this.lowHp.view, this.stickBase, this.stickKnob);

    // the fps / tick readout is for development only
    this.label.visible = import.meta.env.DEV && !scene.record;
    app.ticker.add(this.onTick);
  }

  /** Removes the run from the stage (destroy unparents) and frees the textures it baked. Shared art
   *  textures stay loaded for the next run. */
  destroy(): void {
    this.app.ticker.remove(this.onTick);
    for (const c of [this.sides, this.playMask, this.root, this.lowHp.view, this.stickBase, this.stickKnob]) c.destroy({ children: true });
    releaseBaked(this.app.renderer);
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
    const vp = (this.vp = computeViewport(width, height, this.scene.record > 0));
    this.root.position.set(vp.playX, vp.playY);
    this.playMask.clear().rect(vp.playX, vp.playY, vp.playW, vp.playH).fill(0xffffff);
    this.lowHp.layout(vp);
    this.label.style.fontSize = Math.max(10, 48 * vp.scale);
    this.label.style.stroke = { color: 0x000000, width: Math.max(1, 4 * vp.scale) };
    // dev only, below the HUD strip, the wave counter and the boss bar
    this.label.position.set(24 * vp.scale, 460 * vp.scale);
    this.boss?.layout(vp.playW, vp.scale);
    this.elites?.bar?.layout(vp.playW, vp.scale);
  }

  /** Brings the downed hero back on the next tick (the engine checks he has a revive left). */
  revive(): void {
    this.reviving = true;
  }

  /** Whether the kill cam is still playing after the hero went down (the death panel waits). */
  downCamBusy(): boolean {
    return this.downCam.busy;
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
    if (this.autoplay && s.players[0].offer.length > 0 && this.picking === undefined && !this.paused) {
      this.picking = this.autoplay.pick(s, frameMs);
    }
    const over = this.watchEnd ? s.tick >= this.watchEnd : (s.outcome !== 'playing' && !this.reviving) || (s.players[0].offer.length > 0 && this.picking === undefined);
    this.stepping = !this.paused && !over;
    const real = Math.min(frameMs / 1000, 0.05);
    if (!this.stepping) {
      // a stopped run stands still, but for the kill cam's slow motion after the hero goes down
      // and a won run, where the last boss falls and the fx play out under the closing line
      const cam = this.downCam.step(this.paused ? 0 : real, this.stick.presses);
      const dt = s.outcome === 'won' && !this.paused && !this.watchEnd ? real : cam;
      this.draw(this.loop.alpha, dt, this.paused ? 0 : this.downCam.busy ? dt : real);
      return;
    }
    const speed = this.rushing ? RUSH_SPEED : this.speed, steps = this.loop.advance(frameMs, speed), start = performance.now();
    for (let i = 0; i < steps && !(this.watchEnd && s.tick >= this.watchEnd); i++) {
      this.engine.submit(this.command());
      const events = this.engine.advance();
      // null only while a network input source waits for the server; never offline
      if (!events) break;
      this.react(events);
      this.onEvents(events);
    }
    frameWork.sim += performance.now() - start; // engine steps, with the reactions to their events
    this.draw(this.loop.alpha, real * speed, real);
  }

  /** Dev: the bot is still rushing to the ?from wave, so a recording waits. */
  get rushing(): boolean {
    return this.autoplay?.rushing(this.engine.state) ?? false;
  }

  /** The local stick (and keys) for the next tick, quantized at the input edge. */
  private command() {
    const s = this.stick.read();
    const k = this.platform.readKeys();
    const revive = this.reviving;
    const pick = this.picking;
    this.reviving = false;
    this.picking = undefined;
    const move = this.autoplay ? this.autoplay.move(this.engine.state) : quantizeMove(s.x + k.x, s.y + k.y);
    return { owner: LOCAL, tick: this.engine.nextTick, ...move, revive, pick };
  }

  /** One tick's events: animations, effects and numbers. Positions arrive in FP. */
  private react(events: readonly SimEvent[]): void {
    const s = this.engine.state;
    for (const e of events) {
      switch (e.type) {
        case 'kick':
          if (e.owner === LOCAL) this.hero.attack(s.players[0].relicId);
          break;
        case 'sweep': {
          this.feedback.sweep(e);
          const p = s.players.find((q) => q.owner === e.owner);
          if (e.owner !== LOCAL || !p) break;
          this.staff.swing(e.brad, e.reach / FP, e.full, p.facing);
          this.hero.swing();
          break;
        }
        case 'ring': {
          const p = s.players.find((q) => q.owner === e.owner);
          if (e.owner === LOCAL && p) this.fish.tap(e.x / FP, e.y / FP, e.reach / FP, e.stun, p.awakened, p.facing, this.hero.hand('hand_b'));
          break;
        }
        case 'hurt':
          if (e.owner === LOCAL) {
            this.hero.hurt();
            this.hurtFlash = HURT_FLASH;
            this.downCam.struck(e.src, e.x, e.y);
          }
          break;
        case 'heroDown':
          if (e.owner === LOCAL && s.config.waves > 0) this.downCam.down(s);
          break;
        case 'revive':
          if (e.owner === LOCAL) [this.downCam, this.lowHp].forEach((v) => v.reset());
          break;
        case 'hit':
          this.feedback.hit(e, s);
          break;
        case 'eliteDown':
          this.feedback.eliteDown(e);
          break;
        case 'cleared':
          this.feedback.rout(s);
          break;
        case 'mobDown':
          this.feedback.mobDown(e, s);
          break;
        case 'block': {
          // a door god's shield, or a fallen monk's gong (held toward the hero)
          const g = e.index < s.mobs.length ? null : nearestElite(s.elites, e.x, e.y);
          blockFx(this.fx.pool, e.x / FP, e.y / FP, g ? g.vx : s.players[0].x - e.x, g ? 80 : 45);
          break;
        }
        case 'emerge':
          this.horde.emerge(e.x / FP, e.y / FP);
          break;
        case 'howl':
          howlFx(this.fx.pool, e.x / FP, e.y / FP, e.radius / FP);
          break;
        case 'summon':
          summonFx(this.fx.pool, e.x / FP, e.y / FP);
          break;
        case 'bossCast':
        case 'bossDive':
        case 'bossWindup':
        case 'bossSlam':
        case 'bossDown':
        case 'bossBack':
        case 'bossNext': // the rush's next boss enters as a boss coming back
          if (e.type === 'bossDown') this.shake.blow();
          if (s.boss) this.boss?.react(e, s.boss);
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
        case 'palm':
          this.spells.cast(e);
          break;
        case 'bomb':
        case 'boom':
        case 'seal':
          this.arsenal.on(e);
          break;
        case 'bolt':
          this.spells.bolt(e.x0 / FP, e.y0 / FP, e.x1 / FP, e.y1 / FP, e.gold);
          break;
        case 'bloom':
        case 'roar':
        case 'bounce':
          this.sutras.react(e);
          break;
        case 'dodge': {
          const p = s.players.find((q) => q.owner === e.owner);
          if (p) this.sutras.dodge(p.x / FP, p.y / FP);
          break;
        }
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
    this.feedback.tick(s);
  }

  /** Draws the sim state `alpha` of the way through its last tick; dt is the frame's view time, real its real time. */
  private draw(alpha: number, dt: number, real: number): void {
    const s = this.engine.state;
    const p = s.players[0];
    const hx = lerpX(p, alpha);
    const hy = lerpY(p, alpha);
    this.feedback.frame(dt, hx, hy, p.moving && !p.dead, p.facing);
    this.hero.holdStaff(this.staff.advance(dt));
    this.hero.update(dt, p.facing, p.moving, s, alpha);
    this.hero.view.position.set(hx, hy);
    this.hero.view.zIndex = this.scene.heroOnTop ? (this.scene.heroOverFx ? HERO_OVER_FX_Z : HERO_TOP_Z) : hy;
    // a red flash that fades, not a see-through blink: a 10 Hz strobe over the crowd is tiring
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    // a downed hero lies greyed out until revived
    this.hero.view.tint = p.dead ? DOWN_TINT : hurtTint(this.hurtFlash / HURT_FLASH);
    // untouchable (after a blow, a revive, a pick or the bell) pulses softly
    this.hero.view.alpha = p.dead ? 0.6 : guardAlpha(p.hurtCd, alpha);
    this.healthBar.update(dt, p.hp, p.maxHp, p.lowest);
    this.healthBar.view.position.set(hx, hy + 22);
    this.healthBar.view.zIndex = this.hero.view.zIndex + 0.25;
    this.lowHp.update(real, p.hp, p.maxHp, s.config.waves > 0 && s.outcome === 'playing' && !p.dead);

    this.horde.draw(s.mobs, alpha, dt, hx, hy);
    this.elites?.draw(this.horde.routed ? [] : s.elites, alpha, dt, hx, hy, isMidBoss(s.wave, s.config.waves), 2 * twinHp(s.config.chapter, s.wave, s.config.hard));
    this.corpses.update(dt);
    this.mist?.update(dt);
    this.balls.sync(s.balls, alpha, dt);
    this.bowls.sync(s.bowls, alpha, dt, this.hero.hand());
    const hand = this.hero.hand();
    this.staff.draw(hx, hy, hx + hand.x, hy + hand.y, this.hero.view.zIndex);
    this.fish.update(dt);
    this.beads.draw(s.beads, p.relicId === 'beads' && !p.dead ? beadsRings(p) : [], alpha, hx, hy, this.hero.view.zIndex);
    this.spells.draw(s.fields, s.cymbals, alpha, dt);
    this.arsenal.draw(s.talismans, s.knives, alpha, dt, hx, hy);
    this.sutras.draw(s.lotuses, p, alpha, dt, hx, hy);
    this.spells.drawBell(p.bell && !p.dead, hx, hy, this.hero.view.zIndex, dt);
    this.zen.update(dt, inZen(p) && !p.dead, hx, hy);
    this.aura.update(dt, hx, hy, this.fx.pool);
    this.fx.update(dt, this.aura.parts);
    this.damage.update(dt, hx, hy);
    this.drops.draw(s.gems, alpha);
    this.threats?.draw(s.bullets, s.zones, alpha);
    this.boss?.draw(s.boss, alpha, dt, hx);

    const vp = this.vp; // camera: eases after the hero, on whole pixels; locked on in a paused replay, whose seek passes no view time
    ease(this.camPos, hx, hy, dt, (this.scene.cam === 'lock' || (this.watchEnd > 0 && this.paused) ? LOCKED_CAMERA : SMOOTH_CAMERA).camEase);
    const res = this.app.renderer.resolution;
    const sh = this.shake.step(real); // real time, not sim time
    // the kill cam eases in toward the killing blow
    const cam = this.downCam.frame(this.camPos, vp.playW / vp.scale, vp.playH / vp.scale);
    const k = vp.scale * cam.zoom;
    this.world.scale.set(k);
    this.world.position.set(snapToPixel(vp.playW / 2 - cam.x * k + sh.x, res), snapToPixel(vp.playH / 2 - cam.y * k + sh.y, res));

    drawStick(this.stick, this.stickBase, this.stickKnob, STICK_RADIUS);
    if (this.watchEnd) this.stickBase.visible = this.stickKnob.visible = this.label.visible = false;
    this.fpsTimer -= dt;
    if (this.fpsTimer <= 0) {
      this.fpsTimer = 0.5;
      this.label.text = `${Math.round(this.app.ticker.FPS)} fps  ${this.levelName}
Lv ${p.level}  xp ${p.xp}  gems ${s.gems.length}  tick ${s.tick}`;
    }
  }
}
