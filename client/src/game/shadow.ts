import { Graphics, Particle, ParticleContainer, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { bakeTexture, keepForSession } from './bake';

// Ground shadows: one shared disc texture stretched into an ellipse per figure. As sprites
// they batch with the figures around them, where a Graphics per shadow would not. The horde's
// shadows are particles of one ShadowBatch instead: one draw, and nothing for the world to sort.

const R = 64;
/** Shadows draw under every standing figure. */
export const SHADOW_Z = -1e6;

export function shadowTexture(renderer: Renderer): Texture {
  return keepForSession(renderer, 'shadow', () => bakeShadow(renderer));
}

function bakeShadow(renderer: Renderer): Texture {
  const g = new Graphics().circle(R, R, R - 1).fill({ color: 0x000000, alpha: 0.3 });
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, R * 2, R * 2), resolution: 1, antialias: true });
  return tex;
}

export function makeShadow(tex: Texture, rx: number, ry: number): Sprite {
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  sizeShadow(s, rx, ry);
  s.zIndex = SHADOW_Z;
  return s;
}

/** Half-width and half-height in world units, times `k`. */
export function sizeShadow(s: Sprite, rx: number, ry: number, k = 1): void {
  s.scale.set((rx / R) * k, (ry / R) * k);
}

/** A crowd's shadows, refilled every frame: begin, add each shown figure's, end. */
export class ShadowBatch {
  readonly view: ParticleContainer;
  private readonly particles: Particle[] = [];
  private count = 0;

  constructor(private readonly tex: Texture) {
    this.view = new ParticleContainer({ texture: tex, dynamicProperties: { position: true, vertex: true, rotation: false, uvs: false, color: false } });
  }

  begin(): void {
    this.count = 0;
  }

  /** A shadow at (x, y) with half-width and half-height rx, ry, world units. */
  add(x: number, y: number, rx: number, ry: number): void {
    if (this.particles.length <= this.count) this.particles.push(new Particle({ texture: this.tex, anchorX: 0.5, anchorY: 0.5 }));
    const p = this.particles[this.count++];
    p.x = x;
    p.y = y;
    p.scaleX = rx / R;
    p.scaleY = ry / R;
  }

  end(): void {
    const kids = this.view.particleChildren;
    if (kids.length === this.count) return;
    kids.length = 0;
    for (let i = 0; i < this.count; i++) kids.push(this.particles[i]);
    this.view.update();
  }
}
