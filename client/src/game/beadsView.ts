import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { bakeTexture } from './bake';
import { CORGI, CORGI_FX, corgiDrone } from './corgiFx';
import { FP, type Bead, type BeadsRing } from '@hk/engine';
import { lerpX, lerpY } from './fixedStep';
import { relicExtra, relicSize } from './relicBlow';
import { ViewPool } from './viewPool';

// The prayer beads relic (engine systems/beads.ts): the sim's beads circling the hero, on a
// faint cord at their orbit so the ring reads as one string of beads. They draw over the horde
// they hit, the near half in front of the hero and the far half behind him. The 108 Beads'
// outer ring is gold. The corgi's Orbit Drones are drones on a faint cyan orbit, the Drone
// Swarm's second ring steel. `heat` (relicBlow.ts, set every frame) draws a gold streak
// (cyan for the drones) along the orbit behind each bead while the screen is quiet, faint late.

/** Beads circle at chest height. */
const LIFT = 45;
const BEAD_D = 64;
const OUTLINE = 0x3a2410;
const CORD = CORGI ? CORGI_FX.cyan : 0x5a3018;
const STREAK = CORGI ? CORGI_FX.cyan : 0xffd860;
/** The streak's length along the orbit (radians) on a quiet screen, in tapering pieces. */
const STREAK_TURN = 0.6;
const STREAK_PIECES = 4;
const LOOKS = [
  { fill: 0xb8452e, shade: 0x7e2a1c },
  { fill: 0xf0b030, shade: 0xb87818 },
];

function beadTexture(renderer: Renderer, fill: number, shade: number, ring: number): Texture {
  const r = BEAD_D / 2;
  const g = CORGI ? corgiDrone(BEAD_D, ring > 0) : new Graphics()
    .circle(r, r, r - 1).fill(OUTLINE)
    .circle(r, r, r - 6).fill(fill)
    // one hard cel shadow on the lower right, a small highlight on the upper left
    .arc(r, r, r - 6, -0.3, Math.PI * 0.85).arc(r - 6, r - 6, r - 8, Math.PI * 0.85, -0.3, true).fill(shade)
    .ellipse(r - 9, r - 10, 6, 4).fill(0xffffff);
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, BEAD_D, BEAD_D), resolution: 1, antialias: true });
  return tex;
}

export class BeadsView {
  /** 0 the empty opening screen .. 1 a full late-game one; set by HitFeedback every frame. */
  heat = 0;
  private readonly textures: Texture[];
  private readonly sprites = new Map<number, { sprite: Sprite; seen: boolean }>();
  private readonly cord = new Graphics();
  /** Streaks behind the beads in front of the hero, and behind those behind him. */
  private readonly near = new Graphics();
  private readonly far = new Graphics();
  private cordKey = '';
  private readonly pool: ViewPool<Sprite>;

  constructor(renderer: Renderer, world: Container) {
    this.textures = LOOKS.map((l, i) => beadTexture(renderer, l.fill, l.shade, i));
    this.pool = new ViewPool(() => new Sprite({ anchor: 0.5 }), (s) => world.addChild(s));
    this.cord.visible = false;
    world.addChild(this.cord, this.far, this.near);
  }

  /** A bead's streak on its orbit round (cx, cy), behind `angle` as it turns `dir` (1 clockwise on screen). */
  private streak(g: Graphics, cx: number, cy: number, orbit: number, angle: number, dir: number, turn: number, alpha: number): void {
    const step = turn / STREAK_PIECES;
    for (let k = 0; k < STREAK_PIECES; k++) {
      const left = 1 - k / STREAK_PIECES;
      const a0 = angle - dir * k * step;
      const a1 = a0 - dir * step;
      g.arc(cx, cy, orbit, Math.min(a0, a1), Math.max(a0, a1)).stroke({ color: STREAK, width: BEAD_D * 0.6 * left, alpha: alpha * left, cap: 'butt' });
    }
  }

  /** `rings` are the hero's bead rings (empty without the beads), hero at (hx, hy). */
  draw(beads: readonly Bead[], rings: readonly BeadsRing[], alpha: number, hx: number, hy: number, heroZ: number): void {
    const key = rings.map((r) => r.orbit).join();
    if (key !== this.cordKey) {
      this.cordKey = key;
      this.cord.clear();
      for (const r of rings) this.cord.circle(0, 0, r.orbit / FP).stroke({ color: CORD, width: CORGI ? 4 : 6, alpha: CORGI ? 0.35 : 0.55 });
    }
    this.cord.visible = rings.length > 0;
    this.cord.position.set(hx, hy - LIFT);
    this.cord.zIndex = heroZ - 0.6;
    this.near.clear();
    this.far.clear();
    this.near.zIndex = heroZ + 0.45;
    this.far.zIndex = heroZ - 0.55;
    const turn = STREAK_TURN * relicSize(this.heat);
    const fade = 0.6 * relicExtra(this.heat);
    for (const v of this.sprites.values()) v.seen = false;
    for (const b of beads) {
      let v = this.sprites.get(b.id);
      if (!v) {
        const sprite = this.pool.take();
        sprite.texture = this.textures[b.ring % 2];
        v = { sprite, seen: false };
        this.sprites.set(b.id, v);
      }
      v.seen = true;
      const y = lerpY(b, alpha);
      v.sprite.position.set(lerpX(b, alpha), y - LIFT);
      v.sprite.zIndex = y > hy ? heroZ + 0.5 : heroZ - 0.5;
      const ring = rings[b.ring];
      if (ring) this.streak(y > hy ? this.near : this.far, hx, hy - LIFT, ring.orbit / FP, Math.atan2(y - hy, lerpX(b, alpha) - hx), b.ring % 2 ? -1 : 1, turn, fade);
    }
    for (const [id, v] of this.sprites) {
      if (v.seen) continue;
      this.pool.give(v.sprite);
      this.sprites.delete(id);
    }
  }
}
