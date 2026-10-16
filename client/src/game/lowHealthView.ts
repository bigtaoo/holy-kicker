import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { bakeTexture } from './bake';
import { BALANCE } from '../meta/balance';
import { LowHealth } from './lowHealth';
import type { Viewport } from './viewport';

// The low-health warning's red screen edge (lowHealth.ts): one small baked gradient strip,
// stretched along the four sides of the play area, its alpha pulsing with the heartbeat. Four
// sprites over the world and under the HUD; no full-screen filter.

const COLOR = 0xc81414;
/** The strip's texture: rows from the edge inward, alpha falling off to nothing. */
const STRIP_W = 4;
const STRIP_H = 64;
/** How deep the red reaches in from each side, logical units. */
const DEPTH = 240;
/** The strip's alpha at the very edge. */
const EDGE_ALPHA = 0.75;

function stripTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  for (let y = 0; y < STRIP_H; y++) {
    const k = 1 - y / STRIP_H;
    g.rect(0, y, STRIP_W, 1).fill({ color: COLOR, alpha: EDGE_ALPHA * k * k });
  }
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, STRIP_W, STRIP_H), resolution: 1 });
  g.destroy();
  return tex;
}

export class LowHealthView {
  readonly view = new Container();
  private readonly state: LowHealth;
  private readonly sides: Sprite[];

  constructor(renderer: Renderer, private readonly onBeat: () => void) {
    this.state = new LowHealth(BALANCE.lowHealth);
    const tex = stripTexture(renderer);
    // top, right, bottom, left: each turned so the texture's strong edge lies on its side
    this.sides = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((rotation) => {
      const s = new Sprite(tex);
      s.rotation = rotation;
      return s;
    });
    this.view.addChild(...this.sides);
    this.view.visible = false;
    this.view.eventMode = 'none';
  }

  /** Fits the edges to the play area, in screen pixels. */
  layout(vp: Viewport): void {
    const { playX: x, playY: y, playW: w, playH: h } = vp;
    const d = DEPTH * vp.scale;
    const [top, right, bottom, left] = this.sides;
    const place = (s: Sprite, px: number, py: number, length: number) => {
      s.position.set(px, py);
      s.scale.set(length / STRIP_W, d / STRIP_H);
    };
    place(top, x, y, w);
    place(right, x + w, y, h);
    place(bottom, x + w, y + h, w);
    place(left, x, y + h, h);
  }

  /** Advances by `real` seconds with the hero at `hp` of `maxHp`; `live` says the warning applies. */
  update(real: number, hp: number, maxHp: number, live: boolean): void {
    if (this.state.step(real, hp, maxHp, live)) this.onBeat();
    const a = this.state.pulse;
    this.view.visible = a > 0;
    this.view.alpha = a;
  }

  /** Off at once (a revive). */
  reset(): void {
    this.state.reset();
    this.view.visible = false;
  }
}
