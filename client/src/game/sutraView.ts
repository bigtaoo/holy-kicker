import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { bakeTexture } from './bake';
import { FP, TICK_RATE, haloLength, haloSpin, slotStats, type Lotus, type Player } from '@hk/engine';
import { SHADOW_Z } from './shadow';

// The sutra spells (engine systems/sutras.ts). Lotus Steps: the sim's seeds as small lotus buds
// on the ground (gold for the Lotus Path) and a ring of petals opening where one blooms. Halo
// Beam: the hero's beams drawn from his chest out to their length, over the horde, turning
// with the sim's angle. Lion's Roar: three sound waves rolling out through the cone (all the
// way round for the Thunder Roar). The monks' passives (engine systems/monks.ts) use the same
// bursts: the fat monk's Belly Bounce rolls saffron rings out over the ground, and the
// novice's dodge leaves white speed streaks either side of him.

const TAU = Math.PI * 2;
const BRADS = 65536;
const BUD = 56;
const PETAL = 0xf4a0c0;
const PETAL_RIM = 0xffe0ec;
const GOLD = 0xffd860;
const BEAM = 0xfff0b8;
/** The beams leave the hero at chest height. */
const CHEST = 60;
const BLOOM_LIFE = 0.45;
const ROAR_LIFE = 0.4;
const BOUNCE = 0xffb030;
const BOUNCE_LIFE = 0.35;
const DODGE_LIFE = 0.3;
/** Ground effects are drawn squashed like the spell fields (spellView.ts). */
const GROUND = 0.45;

function budTexture(renderer: Renderer, fill: number): Texture {
  const r = BUD / 2;
  // three petals over a leaf, thick outline, one hard shade
  const g = new Graphics()
    .ellipse(r, r + 12, r - 4, 9).fill(0x4a8a3a).stroke({ color: 0x24401c, width: 4 })
    .ellipse(r - 10, r, 9, 16).fill(fill).stroke({ color: 0x5a2038, width: 4 })
    .ellipse(r + 10, r, 9, 16).fill(fill).stroke({ color: 0x5a2038, width: 4 })
    .ellipse(r, r - 4, 10, 19).fill(fill).stroke({ color: 0x5a2038, width: 4 })
    .ellipse(r + 3, r - 2, 4, 12).fill({ color: 0x000000, alpha: 0.18 });
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, BUD, BUD + 8), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}

interface Burst {
  g: Graphics;
  t: number;
  life: number;
  draw: (g: Graphics, k: number) => void;
}

export class SutraView {
  private readonly buds: Texture[];
  private readonly seeds = new Map<number, { sprite: Sprite; seen: boolean }>();
  private readonly beams = new Graphics();
  private readonly bursts: Burst[] = [];

  constructor(renderer: Renderer, private readonly world: Container, private readonly overZ: number) {
    this.buds = [budTexture(renderer, PETAL), budTexture(renderer, GOLD)];
    this.beams.visible = false;
    world.addChild(this.beams);
  }

  /** A seed bloomed at (x, y) with radius r, world units: petals open over the ground. */
  bloom(x: number, y: number, r: number): void {
    this.burst(x, y, BLOOM_LIFE, (g, k) => {
      const reach = r * (0.35 + 0.65 * Math.sqrt(k));
      const a = 1 - k;
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * TAU + k * 0.6;
        const px = Math.cos(t) * reach;
        const py = Math.sin(t) * reach * GROUND;
        g.ellipse(px, py, r * 0.16, r * 0.16 * GROUND).fill({ color: PETAL, alpha: 0.8 * a });
      }
      g.ellipse(0, 0, reach, reach * GROUND).stroke({ color: PETAL_RIM, width: 10, alpha: 0.7 * a });
    }, SHADOW_Z + 2);
  }

  /** A roar from (x, y) toward `brad`, to radius r (world units), all round if `full`. */
  roar(x: number, y: number, brad: number, r: number, full: boolean): void {
    const mid = (brad / BRADS) * TAU;
    const half = full ? Math.PI : 0.87;
    this.burst(x, y - CHEST * 0.5, ROAR_LIFE, (g, k) => {
      for (let w = 0; w < 3; w++) {
        const kk = k * 1.3 - w * 0.15;
        if (kk <= 0 || kk >= 1) continue;
        const rr = r * kk;
        const style = { color: BEAM, width: 18 - w * 4, alpha: 0.85 * (1 - kk), cap: 'round' as const };
        if (full) g.circle(0, 0, rr).stroke(style);
        else g.arc(0, 0, rr, mid - half, mid + half).stroke(style);
      }
    }, this.overZ);
  }

  /** Belly Bounce: two saffron rings out to `r` on the ground around (x, y). */
  bounce(x: number, y: number, r: number): void {
    this.burst(x, y, BOUNCE_LIFE, (g, k) => {
      g.scale.y = GROUND;
      for (let w = 0; w < 2; w++) {
        const kk = k * 1.2 - w * 0.2;
        if (kk <= 0 || kk >= 1) continue;
        g.circle(0, 0, r * kk).stroke({ color: BOUNCE, width: 26 - w * 8, alpha: 0.9 * (1 - kk) });
      }
    }, SHADOW_Z + 1);
  }

  /** A dodge: speed streaks on both sides of the hero at (x, y), fading as they slide back. */
  dodge(x: number, y: number): void {
    this.burst(x, y - CHEST, DODGE_LIFE, (g, k) => {
      const a = 0.9 * (1 - k);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const sx = side * (55 + 30 * k + i * 6);
          const sy = -30 + i * 30;
          g.moveTo(sx, sy).lineTo(sx + side * (40 - i * 8), sy).stroke({ color: 0xffffff, width: 10, alpha: a, cap: 'round' });
        }
      }
    }, this.overZ);
  }

  private burst(x: number, y: number, life: number, draw: (g: Graphics, k: number) => void, z: number): void {
    const g = new Graphics();
    g.position.set(x, y);
    g.zIndex = z;
    this.world.addChild(g);
    this.bursts.push({ g, t: 0, life, draw });
  }

  /** The seeds on the ground, the local hero's halo (hero at hx, hy) and the bursts. */
  draw(lotuses: readonly Lotus[], p: Player, alpha: number, dt: number, hx: number, hy: number): void {
    for (const v of this.seeds.values()) v.seen = false;
    for (const l of lotuses) {
      let v = this.seeds.get(l.id);
      if (!v) {
        const sprite = new Sprite({ texture: this.buds[l.pull ? 1 : 0], anchor: { x: 0.5, y: 0.75 } });
        sprite.position.set(l.x / FP, l.y / FP);
        sprite.zIndex = l.y / FP;
        this.world.addChild(sprite);
        v = { sprite, seen: false };
        this.seeds.set(l.id, v);
      }
      v.seen = true;
      // grows in, dims until armed, fades over its last half second
      const age = (l.age + alpha) / TICK_RATE;
      const left = (l.life - l.age) / TICK_RATE;
      v.sprite.scale.set(Math.min(1, 0.4 + age * 3));
      v.sprite.alpha = Math.min(1, left * 2) * (l.age < 12 ? 0.6 : 1);
    }
    for (const [id, v] of this.seeds) {
      if (v.seen) continue;
      v.sprite.destroy();
      this.seeds.delete(id);
    }
    this.drawHalo(p, alpha, hx, hy);
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      if (b.t >= b.life) {
        b.g.destroy();
        this.bursts.splice(i, 1);
        continue;
      }
      b.draw(b.g.clear(), b.t / b.life);
    }
  }

  private drawHalo(p: Player, alpha: number, hx: number, hy: number): void {
    const slot = p.spells.find((sp) => sp.id === 'halo');
    this.beams.visible = !!slot && !p.dead;
    if (!slot || p.dead) return;
    const l = slotStats(slot);
    const spin = haloSpin(p, l.life);
    // the sim's angle is after its last tick: draw it `alpha` of the way from the one before
    const a0 = ((p.halo - spin + spin * alpha) / BRADS) * TAU;
    const len = haloLength(p, l.radius) / FP;
    const g = this.beams.clear();
    g.position.set(hx, hy - CHEST);
    g.zIndex = this.overZ;
    for (let k = 0; k < l.count; k++) {
      const a = a0 + (k / l.count) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // a soft wide glow, then the bright core, trailing a faint wedge where it just swept
      const trail = (spin / BRADS) * TAU * 4;
      g.moveTo(0, 0).arc(0, 0, len, a - trail, a).lineTo(0, 0).fill({ color: GOLD, alpha: 0.18 });
      g.moveTo(c * 30, s * 30).lineTo(c * len, s * len).stroke({ color: GOLD, width: 34, alpha: 0.35, cap: 'round' });
      g.moveTo(c * 30, s * 30).lineTo(c * len, s * len).stroke({ color: BEAM, width: 12, alpha: 0.95, cap: 'round' });
    }
    g.circle(0, 0, 34).fill({ color: BEAM, alpha: 0.45 });
  }
}
