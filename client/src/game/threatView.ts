import { Container, Graphics, Particle, ParticleContainer, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { FP, THREATS, TICK_RATE, type Bullet, type Zone } from '@hk/engine';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import { SHADOW_Z } from './shadow';

// Draws the sim's enemy attacks in one of the looks compared for readability: bullets are
// baked into one texture and drawn by a ParticleContainer; zones are a few sprites each (a
// warning disc with a hard edge, and an inner disc that grows to the edge as the blast nears).

/** Looks compared for readability, chosen in the scene options. */
export type BulletLook = 'red' | 'violet' | 'ink';
export const BULLET_LOOKS: readonly BulletLook[] = ['red', 'violet', 'ink'];
export type ZoneLook = 'fill' | 'edge';
export type ZoneLayer = 'under' | 'over' | 'top';

/** Body, rim and core per bullet look; zones take the rim colour. */
const BULLET: Record<BulletLook, { body: number; rim: number; core: number }> = {
  red: { body: 0xff2b3d, rim: 0xff2b3d, core: 0xffffff },
  violet: { body: 0xb04cff, rim: 0xb04cff, core: 0xffffff },
  ink: { body: 0x1c1024, rim: 0xff2b3d, core: 0xff6070 },
};
const OUTLINE = 0x140c18;
/** Bullet diameter in world units (a mob is 80 tall). */
const BULLET_SIZE = 40;
const BAKE_RES = 2;
/** Over the spells, under the hero (1e7 + 0.5) and the numbers. */
const BULLET_Z = 1e7 + 0.25;
/** Over the horde and flying gems, under the elite (HERO_TOP_Z - 1). */
const ZONE_OVER_Z = 5e6 - 2.5;
/** Over the spells too, under the bullets. */
export const ZONE_TOP_Z = 1e7 + 0.2;
const ZONE_TEX = 128;

function bake(renderer: Renderer, g: Graphics, size: number, resolution: number): Texture {
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, size, size), resolution, antialias: true });
  g.destroy();
  return tex;
}

/** A round bullet: soft halo, dark outline, flat body, bright core. */
function bulletTexture(renderer: Renderer, look: BulletLook): Texture {
  const c = BULLET[look];
  const s = BULLET_SIZE * 1.6;
  const h = s / 2;
  const r = BULLET_SIZE / 2;
  const g = new Graphics()
    .circle(h, h, h - 1).fill({ color: c.rim, alpha: 0.28 })
    .circle(h, h, r).fill(c.body).stroke({ color: look === 'ink' ? c.rim : OUTLINE, width: 5 })
    .circle(h, h, r * 0.45).fill(c.core);
  return bake(renderer, g, s, BAKE_RES);
}

/** Warning disc of radius ZONE_TEX / 2 - 4; `fill` adds a translucent floor to the edge. */
export function zoneTextures(renderer: Renderer, color: number, look: ZoneLook): [Texture, Texture] {
  const h = ZONE_TEX / 2;
  const r = h - 4;
  const outer = new Graphics();
  if (look === 'fill') outer.circle(h, h, r).fill({ color, alpha: 0.16 });
  outer.circle(h, h, r).stroke({ color: OUTLINE, width: 7, alpha: 0.6 }).circle(h, h, r).stroke({ color, width: 4 });
  const inner = new Graphics().circle(h, h, r).fill({ color, alpha: look === 'fill' ? 0.3 : 0.18 });
  if (look === 'edge') inner.circle(h, h, r).stroke({ color, width: 3, alpha: 0.9 });
  return [bake(renderer, outer, ZONE_TEX, 2), bake(renderer, inner, ZONE_TEX, 2)];
}

export class ThreatLayer {
  private readonly bullets = new ParticleContainer({ dynamicProperties: { position: true } });
  private readonly bulletParts: Particle[] = [];
  private readonly bulletTex: Texture;
  private readonly zones = new Container();
  private readonly zoneSprites: [Sprite, Sprite][] = [];
  private readonly zoneTex: [Texture, Texture];
  private readonly color: number;

  constructor(renderer: Renderer, world: Container, look: BulletLook, zoneLook: ZoneLook, layer: ZoneLayer, private readonly fx: FxPool) {
    this.color = BULLET[look].rim;
    this.bulletTex = bulletTexture(renderer, look);
    this.bullets.texture = this.bulletTex;
    this.bullets.zIndex = BULLET_Z;
    this.zoneTex = zoneTextures(renderer, this.color, zoneLook);
    // under: on the ground with the shadows, so the horde stands on it
    this.zones.zIndex = layer === 'under' ? SHADOW_Z + 0.5 : layer === 'over' ? ZONE_OVER_Z : ZONE_TOP_Z;
    world.addChild(this.zones, this.bullets);
  }

  draw(bullets: readonly Bullet[], zones: readonly Zone[], alpha: number): void {
    this.drawBullets(bullets, alpha);
    this.drawZones(zones, alpha);
  }

  private drawBullets(bs: readonly Bullet[], alpha: number): void {
    while (this.bulletParts.length < bs.length) {
      this.bulletParts.push(new Particle({ texture: this.bulletTex, anchorX: 0.5, anchorY: 0.5 }));
    }
    const kids = this.bullets.particleChildren;
    if (kids.length !== bs.length) {
      kids.length = 0;
      for (let i = 0; i < bs.length; i++) kids.push(this.bulletParts[i]);
      this.bullets.update();
    }
    for (let i = 0; i < bs.length; i++) {
      // bullets fly at chest height over their ground position
      this.bulletParts[i].x = lerpX(bs[i], alpha);
      this.bulletParts[i].y = lerpY(bs[i], alpha) - 50;
    }
  }

  private drawZones(zs: readonly Zone[], alpha: number): void {
    const warn = THREATS.warn;
    while (this.zoneSprites.length < zs.length) {
      const pair = this.zoneTex.map((t) => {
        const s = new Sprite(t);
        s.anchor.set(0.5);
        this.zones.addChild(s);
        return s;
      }) as [Sprite, Sprite];
      this.zoneSprites.push(pair);
    }
    this.zoneSprites.forEach(([outer, inner], i) => {
      const z = zs[i];
      outer.visible = inner.visible = !!z;
      if (!z) return;
      const k = (z.radius * 2) / FP / (ZONE_TEX - 8);
      // a zone written to go off later (the judge's strokes) starts below 0 and waits half-drawn
      const age = Math.max(0, z.age + alpha);
      const t = Math.min(1, age / warn);
      outer.position.set(z.x / FP, z.y / FP);
      inner.position.set(z.x / FP, z.y / FP);
      // pops in, then the inner disc fills out to the edge
      outer.scale.set(k * Math.min(1, 0.6 + (age / TICK_RATE) * 4));
      inner.scale.set(k * t);
    });
  }

  /** A zone went off at (x, y), world units. */
  blast(x: number, y: number, r: number): void {
    this.fx.emit({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.25, size0: r, size1: r * 2.4, rotation: 0, spin: 0, drag: 1, color: this.color, alpha: 0.9 });
    this.fx.emit({ shape: 'glow', x, y, vx: 0, vy: 0, life: 0.2, size0: r * 2, size1: r * 2.2, rotation: 0, spin: 0, drag: 1, color: this.color, alpha: 0.5 });
  }
}
