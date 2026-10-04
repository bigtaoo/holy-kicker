import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { bakeTexture } from './bake';
import { FP, type Bead, type BeadsRing } from '@hk/engine';
import { lerpX, lerpY } from './fixedStep';

// The prayer beads relic (engine systems/beads.ts): the sim's beads circling the hero, on a
// faint cord at their orbit so the ring reads as one string of beads. They draw over the horde
// they hit, the near half in front of the hero and the far half behind him. The 108 Beads'
// outer ring is gold.

/** Beads circle at chest height. */
const LIFT = 45;
const BEAD_D = 64;
const OUTLINE = 0x3a2410;
const CORD = 0x5a3018;
const LOOKS = [
  { fill: 0xb8452e, shade: 0x7e2a1c },
  { fill: 0xf0b030, shade: 0xb87818 },
];

function beadTexture(renderer: Renderer, fill: number, shade: number): Texture {
  const r = BEAD_D / 2;
  const g = new Graphics()
    .circle(r, r, r - 1).fill(OUTLINE)
    .circle(r, r, r - 6).fill(fill)
    // one hard cel shadow on the lower right, a small highlight on the upper left
    .arc(r, r, r - 6, -0.3, Math.PI * 0.85).arc(r - 6, r - 6, r - 8, Math.PI * 0.85, -0.3, true).fill(shade)
    .ellipse(r - 9, r - 10, 6, 4).fill(0xffffff);
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, BEAD_D, BEAD_D), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}

export class BeadsView {
  private readonly textures: Texture[];
  private readonly sprites = new Map<number, { sprite: Sprite; seen: boolean }>();
  private readonly cord = new Graphics();
  private cordKey = '';

  constructor(renderer: Renderer, private readonly world: Container) {
    this.textures = LOOKS.map((l) => beadTexture(renderer, l.fill, l.shade));
    this.cord.visible = false;
    world.addChild(this.cord);
  }

  /** `rings` are the hero's bead rings (empty without the beads), hero at (hx, hy). */
  draw(beads: readonly Bead[], rings: readonly BeadsRing[], alpha: number, hx: number, hy: number, heroZ: number): void {
    const key = rings.map((r) => r.orbit).join();
    if (key !== this.cordKey) {
      this.cordKey = key;
      this.cord.clear();
      for (const r of rings) this.cord.circle(0, 0, r.orbit / FP).stroke({ color: CORD, width: 6, alpha: 0.55 });
    }
    this.cord.visible = rings.length > 0;
    this.cord.position.set(hx, hy - LIFT);
    this.cord.zIndex = heroZ - 0.6;
    for (const v of this.sprites.values()) v.seen = false;
    for (const b of beads) {
      let v = this.sprites.get(b.id);
      if (!v) {
        const sprite = new Sprite({ texture: this.textures[b.ring % 2], anchor: 0.5 });
        this.world.addChild(sprite);
        v = { sprite, seen: false };
        this.sprites.set(b.id, v);
      }
      v.seen = true;
      const y = lerpY(b, alpha);
      v.sprite.position.set(lerpX(b, alpha), y - LIFT);
      v.sprite.zIndex = y > hy ? heroZ + 0.5 : heroZ - 0.5;
    }
    for (const [id, v] of this.sprites) {
      if (v.seen) continue;
      v.sprite.destroy();
      this.sprites.delete(id);
    }
  }
}
