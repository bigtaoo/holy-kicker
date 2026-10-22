import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { bakeTexture } from './bake';
import { TrailHistory } from './ballTrail';
import { CORGI, CORGI_FX, corgiDisc } from './corgiFx';
import type { Bowl } from '@hk/engine';
import { lerpX, lerpY } from './fixedStep';
import { relicExtra, relicSize, ribbonQuad } from './relicBlow';
import { makeShadow } from './shadow';
import { ViewPool } from './viewPool';

// The alms bowl relic (engine systems/bowl.ts): thrown bowls in flight, drawn from the sim's
// bowl list as a spinning bowl seen from above over a ground shadow. The mobs it drags are
// ordinary mobs the sim moves along with it. The Bottomless Bowl's opening is a dark void. The
// corgi throws a striped disc, steel and cyan for the Saw Storm. `heat` (relicBlow.ts, set
// every frame) draws a gold streak behind a bowl in flight while the screen is quiet (orange
// behind the disc, cyan behind the Saw Storm), faint late.

/** Drawn this far above its ground point. */
const LIFT = 45;
const SIZE = 120;
/** Seconds a new bowl takes to come from the throwing hand onto its flight line, growing from half size. */
const FROM_HAND = 0.15;
const OUTLINE = 0x3a2410;
const LOOKS = [
  { body: 0x9a5a2a, shade: 0x6e3c1a, inside: 0x4a2812 },
  { body: 0x9a5a2a, shade: 0x6e3c1a, inside: 0x1c0e26 },
];
const RIM = 0xf0b030;
const STREAK = [CORGI ? CORGI_FX.orange : 0xffd860, CORGI ? CORGI_FX.cyan : 0xffd860];
/** The streak's length in seconds of flight on a quiet screen, its width at the bowl, its points. */
const STREAK_TIME = 0.12;
const STREAK_W = SIZE * 0.7;
const STREAK_POINTS = 6;

/** A streak and the bowl's recent places it is drawn through. */
class Streak {
  readonly g = new Graphics();
  readonly hist = new TrailHistory(16);
  get visible(): boolean {
    return this.g.visible;
  }
  set visible(v: boolean) {
    this.g.visible = v;
  }
}

function bowlTexture(renderer: Renderer, look: (typeof LOOKS)[number], storm: boolean): Texture {
  const r = SIZE / 2;
  const g = CORGI ? corgiDisc(SIZE, storm) : new Graphics()
    .circle(r, r, r - 1).fill(OUTLINE)
    .circle(r, r, r - 7).fill(look.body)
    // one hard cel shadow on the lower right of the outer wall
    .arc(r, r, r - 7, -0.3, Math.PI * 0.85).arc(r - 7, r - 7, r - 9, Math.PI * 0.85, -0.3, true).fill(look.shade)
    .circle(r, r, r - 18).fill(RIM)
    .circle(r, r, r - 24).fill(OUTLINE)
    .circle(r, r, r - 28).fill(look.inside)
    .ellipse(r - 26, r - 30, 9, 5).fill(0xffffff);
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, SIZE, SIZE), resolution: 1, antialias: true });
  return tex;
}

interface Flight {
  sprite: Sprite;
  shadow: Sprite;
  streak: Streak;
  color: number;
  seen: boolean;
  /** Where it left the hand, from its drawn point, and how much of that is left (1 → 0). */
  fromX: number;
  fromY: number;
  from: number;
}

export class BowlView {
  /** 0 the empty opening screen .. 1 a full late-game one; set by HitFeedback every frame. */
  heat = 0;
  private readonly textures: Texture[];
  private readonly live = new Map<number, Flight>();
  private readonly bowls: ViewPool<Sprite>;
  private readonly shadows: ViewPool<Sprite>;
  private readonly streaks: ViewPool<Streak>;
  private readonly pts = new Float64Array(STREAK_POINTS * 2);
  private readonly quad: number[] = [];
  private now = 0;

  constructor(renderer: Renderer, layer: Container, shadowTex: Texture) {
    this.textures = LOOKS.map((l, i) => bowlTexture(renderer, l, i > 0));
    this.shadows = new ViewPool(() => makeShadow(shadowTex, SIZE * 0.4, SIZE * 0.14), (s) => layer.addChild(s));
    this.bowls = new ViewPool(() => new Sprite({ anchor: 0.5 }), (s) => layer.addChild(s));
    this.streaks = new ViewPool(() => new Streak(), (s) => layer.addChild(s.g));
  }

  /** `hand` is the thrower's hand from his feet, where a new bowl starts out. */
  sync(bowls: readonly Bowl[], alpha: number, dt: number, hand: { x: number; y: number }): void {
    this.now += dt;
    for (const f of this.live.values()) f.seen = false;
    for (const b of bowls) {
      let f = this.live.get(b.id);
      if (!f) {
        const sprite = this.bowls.take();
        sprite.texture = this.textures[b.swallow ? 1 : 0];
        const streak = this.streaks.take();
        streak.hist.clear();
        f = { sprite, shadow: this.shadows.take(), streak, color: STREAK[b.swallow ? 1 : 0], seen: false, fromX: hand.x, fromY: hand.y + LIFT, from: 1 };
        this.live.set(b.id, f);
      }
      f.seen = true;
      const x = lerpX(b, alpha);
      const y = lerpY(b, alpha);
      f.from = Math.max(0, f.from - dt / FROM_HAND);
      f.sprite.position.set(x + f.fromX * f.from, y - LIFT + f.fromY * f.from);
      f.sprite.scale.set(1 - f.from / 2);
      f.sprite.rotation += dt * 9;
      // over the mobs it carries
      f.sprite.zIndex = y + 60;
      f.shadow.position.set(x, y);
      f.streak.hist.push(f.sprite.x, f.sprite.y, this.now);
      this.drawStreak(f);
    }
    for (const [id, f] of this.live) {
      if (f.seen) continue;
      this.bowls.give(f.sprite);
      this.shadows.give(f.shadow);
      this.streaks.give(f.streak);
      this.live.delete(id);
    }
  }

  /** The streak through the bowl's last places, tapering to a point. */
  private drawStreak(f: Flight): void {
    const g = f.streak.g.clear();
    g.zIndex = f.sprite.zIndex - 1;
    const n = f.streak.hist.sample(this.now, STREAK_TIME * relicSize(this.heat), STREAK_POINTS, this.pts);
    const alpha = 0.5 * relicExtra(this.heat);
    const p = this.pts;
    for (let k = 0; k < n - 1; k++) {
      const w0 = 1 - k / (n - 1);
      const w1 = 1 - (k + 1) / (n - 1);
      if (!ribbonQuad(p[2 * k], p[2 * k + 1], p[2 * k + 2], p[2 * k + 3], STREAK_W * w0, STREAK_W * w1, this.quad)) continue;
      g.poly(this.quad).fill({ color: f.color, alpha: alpha * w0 });
    }
  }
}
