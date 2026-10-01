import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import type { FxPool } from './fx';
import type { Mob } from './horde';
import { bolt, explosion, fieldMotes, nova, type RingMode } from './spells';
import { SHADOW_Z } from './shadow';

// Area-damage stress test: casts the chosen spells round-robin at `rate` casts a second around
// the hero, killing every target they reach, so the cost of big spells and the per-kill effects
// they trigger (numbers, corpses, smoke) can be measured together.

export type SpellKind = 'nova' | 'meteor' | 'field' | 'chain';
export const SPELL_KINDS: readonly SpellKind[] = ['nova', 'meteor', 'field', 'chain'];

const NOVA_RADIUS = 700;
const METEORS = 5;
const METEOR_RADIUS = 220;
const FIELD_RADIUS = 380;
const FIELD_LIFE = 3;
const FIELD_TICK = 0.5;
const CHAIN_JUMPS = 8;
const CHAIN_RANGE = 350;

interface Field {
  sprite: Sprite;
  x: number;
  y: number;
  age: number;
  tick: number;
}

function fieldTexture(renderer: Renderer): Texture {
  const r = 128;
  const g = new Graphics()
    .circle(r, r, r * 0.97).fill({ color: 0xffd860, alpha: 0.22 })
    .circle(r, r, r * 0.92).stroke({ color: 0xffe9a0, width: r * 0.07, alpha: 0.9 })
    .circle(r, r, r * 0.6).stroke({ color: 0xffe9a0, width: r * 0.03, alpha: 0.5 });
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, r * 2, r * 2), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}

export class SpellCaster {
  private readonly fields: Field[] = [];
  private readonly fieldTex: Texture;
  private timer = 0;
  private next = 0;
  private readonly hitSet = new Set<number>();

  constructor(
    renderer: Renderer,
    private readonly layer: Container,
    private readonly pool: FxPool,
    private readonly kinds: readonly SpellKind[],
    private readonly rate: number,
    private readonly ring: RingMode,
    private readonly targets: readonly Mob[],
    private readonly kill: (target: number) => void,
    private readonly rand: () => number = Math.random,
  ) {
    this.fieldTex = fieldTexture(renderer);
  }

  update(dt: number, hx: number, hy: number): void {
    this.timer -= dt;
    if (this.kinds.length > 0 && this.timer <= 0) {
      this.timer = 1 / this.rate;
      this.cast(this.kinds[this.next++ % this.kinds.length], hx, hy);
    }
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.age += dt;
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = FIELD_TICK;
        this.area(f.x, f.y, FIELD_RADIUS);
      }
      fieldMotes(this.pool, this.rand, f.x, f.y, FIELD_RADIUS, Math.round(dt * 60));
      f.sprite.alpha = Math.min(1, (FIELD_LIFE - f.age) / 0.3, f.age / 0.15);
      if (f.age >= FIELD_LIFE) {
        f.sprite.destroy();
        this.fields.splice(i, 1);
      }
    }
  }

  private cast(kind: SpellKind, hx: number, hy: number): void {
    const r = this.rand;
    const near = (d: number) => [hx + (r() - 0.5) * 2 * d, hy + (r() - 0.5) * 2 * d];
    if (kind === 'nova') {
      nova(this.pool, hx, hy, 60, NOVA_RADIUS, 0.45, 0xfff0b8, this.ring);
      this.area(hx, hy, NOVA_RADIUS);
    } else if (kind === 'meteor') {
      for (let i = 0; i < METEORS; i++) {
        const [x, y] = near(500);
        explosion(this.pool, r, x, y, METEOR_RADIUS, this.ring);
        this.area(x, y, METEOR_RADIUS);
      }
    } else if (kind === 'field') {
      const [x, y] = near(300);
      const sprite = new Sprite({ texture: this.fieldTex, anchor: 0.5 });
      sprite.scale.set((FIELD_RADIUS * 2) / this.fieldTex.width, (FIELD_RADIUS * 0.9) / this.fieldTex.height);
      sprite.position.set(x, y);
      sprite.zIndex = SHADOW_Z + 1;
      this.layer.addChild(sprite);
      this.fields.push({ sprite, x, y, age: 0, tick: 0 });
    } else {
      this.chain(hx, hy);
    }
  }

  private chain(hx: number, hy: number): void {
    let x = hx;
    let y = hy - 60;
    this.hitSet.clear();
    for (let j = 0; j < CHAIN_JUMPS; j++) {
      let best = -1;
      let bestD = (j === 0 ? CHAIN_RANGE * 2 : CHAIN_RANGE) ** 2;
      this.targets.forEach((t, i) => {
        const d = (t.x - x) ** 2 + (t.y - y) ** 2;
        if (d < bestD && !this.hitSet.has(i)) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0) return;
      this.hitSet.add(best);
      const t = this.targets[best];
      const tx = t.x;
      const ty = t.y - 50;
      bolt(this.pool, this.rand, x, y, tx, ty);
      this.kill(best);
      x = tx;
      y = ty;
    }
  }

  /** Kills every target within r of (x, y). */
  private area(x: number, y: number, r: number): void {
    const r2 = r * r;
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if ((t.x - x) ** 2 + (t.y - y) ** 2 < r2) this.kill(i);
    }
  }
}
