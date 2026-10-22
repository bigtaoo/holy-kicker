import { Graphics, type Container } from 'pixi.js';
import type { Dart } from '@hk/engine';
import { CORGI, CORGI_FX } from './corgiFx';
import { lerpX, lerpY } from './fixedStep';

// The sutras' darts (engine systems/darts.ts): the Halo Beam's needles of light flying on past
// its beams, and the petals a Lotus Steps bloom scatters (homing for the Lotus Path). Small,
// thin and a little see-through, so a busy screen still shows the horde through them; one
// Graphics redrawn each frame over the horde. The corgi's: laser darts and orange shrapnel.

const TAU = Math.PI * 2;
const BRADS = 65536;
/** Needles leave at the beams' chest height; petals fly low. */
const NEEDLE_LIFT = 60;
const PETAL_LIFT = 24;
const NEEDLE_LEN = 46;
const PETAL_LEN = 34;
const PETAL_W = 15;
const GLOW = CORGI ? CORGI_FX.laser : 0xffd860;
const CORE = CORGI ? CORGI_FX.laserCore : 0xfff0b8;
const PETAL = CORGI ? CORGI_FX.orange : 0xf4a0c0;
const PETAL_RIM = CORGI ? CORGI_FX.hot : 0x8a3050;

export class DartView {
  private readonly g = new Graphics();

  constructor(layer: Container, z: number) {
    this.g.zIndex = z;
    layer.addChild(this.g);
  }

  draw(darts: readonly Dart[], alpha: number): void {
    const g = this.g.clear();
    for (const d of darts) {
      const x = lerpX(d, alpha);
      const y = lerpY(d, alpha);
      const a = (d.dir / BRADS) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // each fades over its last few ticks instead of blinking out
      const fade = Math.min(1, (d.life - d.age) / 3);
      if (d.kind === 'needle') {
        const ny = y - NEEDLE_LIFT;
        g.moveTo(x - c * NEEDLE_LEN, ny - s * NEEDLE_LEN).lineTo(x, ny).stroke({ color: GLOW, width: 14, alpha: 0.3 * fade, cap: 'round' });
        g.moveTo(x - c * NEEDLE_LEN * 0.7, ny - s * NEEDLE_LEN * 0.7).lineTo(x, ny).stroke({ color: CORE, width: 5, alpha: 0.9 * fade, cap: 'round' });
        continue;
      }
      // a petal: pointed both ends, tip forward, with a dark rim like the buds
      const py = y - PETAL_LIFT;
      const tx = x + c * PETAL_LEN * 0.5;
      const ty = py + s * PETAL_LEN * 0.5;
      const bx = x - c * PETAL_LEN * 0.5;
      const by = py - s * PETAL_LEN * 0.5;
      g.moveTo(tx, ty)
        .quadraticCurveTo(x - s * PETAL_W, py + c * PETAL_W, bx, by)
        .quadraticCurveTo(x + s * PETAL_W, py - c * PETAL_W, tx, ty)
        .fill({ color: PETAL, alpha: 0.85 * fade })
        .stroke({ color: PETAL_RIM, width: 3, alpha: 0.7 * fade });
    }
  }
}
