import { Container, Graphics, GraphicsContext, Sprite, type Texture } from 'pixi.js';
import { FP, TICK_RATE, type Ball } from '@hk/engine';
import { flashAlpha, flashGrow, heatAlpha, heatSize, taper, TrailHistory } from './ballTrail';
import { CORGI, CORGI_FX } from './corgiFx';
import { lerpX, lerpY } from './fixedStep';
import { makeShadow } from './shadow';

// Kicked cuju balls in flight, drawn from the sim's ball list: a spinning sprite over a ground
// shadow per ball id, a gold streak behind it (ballTrail.ts) and, on the kick, a gold crescent
// at the foot with a puff of dust. Spent sprites are hidden and kept for the next kick; a spent
// ball's streak shrinks into where it vanished first. The awakened Meteor Ball burns (its own
// art, the ball wrapped in flames) and leaves a longer, hotter streak; its one-hit splinters
// are smaller and glow hot. `heat` (0 the empty opening, 1 a full late-game screen, set every
// frame) tones the streak and flash down as the screen fills. The corgi's shots streak orange.

const SIZE = 56;
const METEOR_TINT = 0xffb070;
/** The burning ball's art is mostly flame: the ball inside it is this share of its height. */
const METEOR_BALL = 0.62;
const SPLINTER_SCALE = 0.7;
/** Drawn this far above its ground point. */
export const BALL_LIFT = 45;

/** Points read back along a streak; one glow and one core segment between each two. */
const POINTS = 8;
const SEGS = POINTS - 1;
/** How far back the streak reaches, in seconds of flight (the ball flies 1300 units/s). */
const TRAIL_TIME = 0.1;
const METEOR_TIME = 0.13;
const SPLINTER_TIME = 0.08;
/** The streak's width at the ball, as a share of the ball's size, and its bright core's share of that. */
const TRAIL_WIDTH = 0.95;
const CORE_WIDTH = 0.42;
const GLOW_ALPHA = 0.7;
const CORE_ALPHA = 0.95;
const GLOW = CORGI ? CORGI_FX.orange : 0xffc83a;
const CORE = CORGI ? CORGI_FX.hot : 0xfff2b8;
const HOT_GLOW = CORGI ? CORGI_FX.laser : 0xff8a2a;
const HOT_CORE = CORGI ? CORGI_FX.hot : 0xffe07a;

/** The kick flash: a crescent this big (radius) in front of the foot, and dust behind it. */
const FLASH_LIFE = 0.18;
const FLASH_R = 62;
const DUST = 0xe8dcc0;
const DUST_ALPHA = 0.55;
/** Each puff's direction off straight back (radians), and how far it drifts. */
const PUFFS = [-1.1, -0.4, 0.4, 1.1];
const PUFF_DRIFT = 34;
const PUFF_R = 14;

/** Shapes drawn once in white UNIT across and shared by every instance, which tints and scales them. */
const UNIT = 100;

/**
 * Streak segment k of SEGS: UNIT long along +x from its head end, UNIT wide there and as wide
 * as the next segment's head at its tail (a point for the last), so the segments meet edge to
 * edge in one tapering ribbon instead of overlapping into beads.
 */
function ribbon(k: number): GraphicsContext {
  const r = (1 - (k + 1) / SEGS) / (1 - k / SEGS);
  const h = UNIT / 2;
  return new GraphicsContext().poly([0, -h, UNIT, -h * r, UNIT, h * r, 0, h]).fill(0xffffff);
}

function crescent(): GraphicsContext {
  const steps = 12;
  const spread = 1.25;
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps - 0.5) * 2 * spread;
    pts.push(Math.cos(a) * UNIT, Math.sin(a) * UNIT);
  }
  for (let i = steps; i >= 0; i--) {
    const a = (i / steps - 0.5) * 2 * spread;
    // thickest in the middle, a point at each tip
    const r = UNIT * (1 - 0.34 * Math.sin((i / steps) * Math.PI));
    pts.push(Math.cos(a) * r - UNIT * 0.06, Math.sin(a) * r);
  }
  return new GraphicsContext().poly(pts).fill(0xffffff);
}

interface Flight {
  sprite: Sprite;
  shadow: Sprite;
  trail: Container;
  glow: Graphics[];
  core: Graphics[];
  hist: TrailHistory;
  /** The streak's length in seconds and its width at the ball. */
  time: number;
  width: number;
  seen: boolean;
}

interface Flash {
  view: Container;
  glow: Graphics;
  core: Graphics;
  dust: Graphics[];
  x: number;
  y: number;
  angle: number;
  t: number;
}

export class Balls {
  /** 0 the empty opening screen .. 1 a full late-game one; set by Game every frame. */
  heat = 0;
  private readonly live = new Map<number, Flight>();
  private readonly free: Flight[] = [];
  private readonly dying: Flight[] = [];
  private readonly flashes: Flash[] = [];
  private readonly disc = new GraphicsContext().circle(0, 0, UNIT / 2).fill(0xffffff);
  private readonly moon = crescent();
  private readonly ribbons = Array.from({ length: SEGS }, (_, k) => ribbon(k));
  private readonly pts = new Float64Array(POINTS * 2);
  private now = 0;

  constructor(
    private readonly layer: Container,
    private readonly tex: Texture,
    private readonly meteorTex: Texture,
    private readonly shadowTex: Texture,
  ) {}

  sync(balls: readonly Ball[], alpha: number, dt: number): void {
    this.now += dt;
    for (const f of this.live.values()) f.seen = false;
    for (const b of balls) {
      const splinter = !b.split && b.maxHits === 1;
      let f = this.live.get(b.id);
      if (!f) {
        f = this.take(b, splinter);
        this.live.set(b.id, f);
        // the streak starts where the ball left the foot (or the bounce, for a splinter)
        f.hist.push(b.px / FP, b.py / FP - BALL_LIFT, this.now - alpha / TICK_RATE);
        if (!splinter && b.hits <= 1) this.kick(b);
      }
      f.seen = true;
      const x = lerpX(b, alpha);
      const y = lerpY(b, alpha);
      f.sprite.position.set(x, y - BALL_LIFT);
      f.sprite.rotation += dt * 14 * Math.sign(b.vx || 1);
      const tex = b.split ? this.meteorTex : this.tex;
      f.sprite.texture = tex;
      f.sprite.tint = splinter ? METEOR_TINT : 0xffffff;
      f.sprite.scale.set(((splinter ? SPLINTER_SCALE : 1) * SIZE) / (b.split ? tex.height * METEOR_BALL : tex.height));
      f.sprite.zIndex = y + 1;
      f.trail.zIndex = y + 0.5;
      f.shadow.position.set(x, y);
      f.hist.push(x, y - BALL_LIFT, this.now);
      this.drawTrail(f, 1);
    }
    for (const [id, f] of this.live) {
      if (f.seen) continue;
      f.sprite.visible = f.shadow.visible = false;
      this.live.delete(id);
      this.dying.push(f);
    }
    this.fade();
    this.flash(dt);
  }

  /** Spent balls' streaks shrink into where they vanished, then go back to the pool. */
  private fade(): void {
    const hs = heatSize(this.heat);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const f = this.dying[i];
      const len = f.time * hs;
      const gone = this.now - f.hist.newest;
      if (gone >= len) {
        f.trail.visible = false;
        this.dying.splice(i, 1);
        this.free.push(f);
      } else {
        this.drawTrail(f, 1 - gone / len);
      }
    }
  }

  private drawTrail(f: Flight, fade: number): void {
    const hs = heatSize(this.heat);
    const ha = heatAlpha(this.heat) * fade;
    // the width eases less than the length: a short streak late, not a hair
    const w0 = f.width * (0.5 + 0.5 * hs);
    const n = f.hist.sample(this.now, f.time * hs, POINTS, this.pts);
    const p = this.pts;
    for (let k = 0; k < SEGS; k++) {
      const g = f.glow[k];
      const c = f.core[k];
      if (k >= n - 1) {
        g.visible = c.visible = false;
        continue;
      }
      const x0 = p[2 * k];
      const y0 = p[2 * k + 1];
      const dx = p[2 * k + 2] - x0;
      const dy = p[2 * k + 3] - y0;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const tp = taper(k, SEGS);
      const w = w0 * (1 - k / SEGS);
      g.visible = c.visible = true;
      g.position.set(x0, y0);
      c.position.set(x0, y0);
      g.rotation = c.rotation = angle;
      g.scale.set(len / UNIT, w / UNIT);
      c.scale.set(len / UNIT, (w * CORE_WIDTH) / UNIT);
      g.alpha = GLOW_ALPHA * ha * tp;
      c.alpha = CORE_ALPHA * ha * tp;
    }
  }

  /** A kick: a crescent at the foot pointing where the ball flies, dust kicked up behind. */
  private kick(b: Ball): void {
    let dx = b.x - b.px;
    let dy = b.y - b.py;
    if (dx === 0 && dy === 0) {
      dx = b.vx;
      dy = b.vy;
    }
    let fl = this.flashes.find((q) => !q.view.visible);
    if (!fl) {
      const glow = new Graphics(this.moon);
      const core = new Graphics(this.moon);
      glow.tint = GLOW;
      core.tint = CORE;
      const dust = PUFFS.map(() => {
        const d = new Graphics(this.disc);
        d.tint = DUST;
        return d;
      });
      const view = new Container();
      // the dust sits on the ground, under the crescent
      view.addChild(...dust, glow, core);
      this.layer.addChild(view);
      fl = { view, glow, core, dust, x: 0, y: 0, angle: 0, t: 0 };
      this.flashes.push(fl);
    }
    fl.x = b.px / FP;
    fl.y = b.py / FP;
    fl.angle = Math.atan2(dy, dx);
    fl.t = 0;
    fl.view.visible = true;
    fl.view.zIndex = fl.y + 2;
  }

  private flash(dt: number): void {
    const hs = heatSize(this.heat);
    const ha = heatAlpha(this.heat);
    for (const fl of this.flashes) {
      if (!fl.view.visible) continue;
      fl.t += dt;
      const f = fl.t / FLASH_LIFE;
      if (f >= 1) {
        fl.view.visible = false;
        continue;
      }
      const grow = flashGrow(f);
      const a = flashAlpha(f) * ha;
      const cos = Math.cos(fl.angle);
      const sin = Math.sin(fl.angle);
      const r = FLASH_R * hs * grow;
      // the crescent rides a little ahead of the foot at the ball's height
      const cx = fl.x + cos * r * 0.25;
      const cy = fl.y - BALL_LIFT + sin * r * 0.25;
      fl.glow.position.set(cx, cy);
      fl.glow.rotation = fl.angle;
      fl.glow.scale.set(r / UNIT);
      fl.glow.alpha = 0.85 * a;
      fl.core.position.set(cx + cos * r * 0.08, cy + sin * r * 0.08);
      fl.core.rotation = fl.angle;
      fl.core.scale.set((r * 0.82) / UNIT, (r * 0.7) / UNIT);
      fl.core.alpha = a;
      const drift = PUFF_DRIFT * hs * grow;
      const pr = (PUFF_R * hs * (0.6 + grow)) / (UNIT / 2);
      for (let i = 0; i < fl.dust.length; i++) {
        const d = fl.dust[i];
        const back = fl.angle + Math.PI + PUFFS[i];
        d.position.set(fl.x + Math.cos(back) * drift, fl.y + Math.sin(back) * drift * 0.5);
        d.scale.set(pr, pr * 0.7);
        d.alpha = DUST_ALPHA * a;
      }
    }
  }

  private take(b: Ball, splinter: boolean): Flight {
    let f = this.free.pop();
    if (!f) {
      const sprite = new Sprite(this.tex);
      sprite.anchor.set(0.5);
      sprite.scale.set(SIZE / this.tex.height);
      const trail = new Container();
      const glow: Graphics[] = [];
      const core: Graphics[] = [];
      for (let k = 0; k < SEGS; k++) {
        glow.push(new Graphics(this.ribbons[k]));
        core.push(new Graphics(this.ribbons[k]));
      }
      trail.addChild(...glow, ...core);
      f = {
        sprite, shadow: makeShadow(this.shadowTex, SIZE * 0.4, SIZE * 0.15), trail, glow, core,
        hist: new TrailHistory(), time: 0, width: 0, seen: false,
      };
      this.layer.addChild(f.shadow, f.trail, f.sprite);
    }
    const hot = b.split || splinter;
    for (const g of f.glow) g.tint = hot ? HOT_GLOW : GLOW;
    for (const c of f.core) c.tint = hot ? HOT_CORE : CORE;
    f.time = b.split ? METEOR_TIME : splinter ? SPLINTER_TIME : TRAIL_TIME;
    f.width = SIZE * TRAIL_WIDTH * (splinter ? SPLINTER_SCALE : b.split ? 1.15 : 1);
    f.hist.clear();
    f.sprite.visible = f.shadow.visible = f.trail.visible = true;
    return f;
  }
}
