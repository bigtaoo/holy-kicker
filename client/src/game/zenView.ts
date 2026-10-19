import { Container, Graphics } from 'pixi.js';
import { CORGI, CORGI_FX } from './corgiFx';
import { SHADOW_Z } from './shadow';

// Stillness (engine systems/players.ts): while the hero stands in Zen a gold lotus ring lies on
// the ground at his feet, its petals sliding slowly round; it blooms in with a pulse as he
// enters and is gone the moment he moves, so "stop to burst" reads at a glance without text.
// The corgi's is a targeting ring: four markers pointing in instead of the petals.

const GOLD = CORGI ? CORGI_FX.orange : 0xffd24a;
const PALE = CORGI ? CORGI_FX.hot : 0xfff0b0;
/** World units across the ring, squashed onto the ground like the aura. */
const RADIUS = 120;
const SQUASH = 0.38;
const PETALS = CORGI ? 4 : 8;
const TURN = 0.6;
const FADE_IN = 0.15;
const FADE_OUT = 0.08;
const PULSE = 0.35;

/** A point of the ring at angle a + da, k radii out, squashed onto the ground. */
function marker(a: number, k: number, da: number): [number, number] {
  return [Math.cos(a + da) * RADIUS * k, Math.sin(a + da) * RADIUS * k * SQUASH];
}

export class ZenRing {
  private readonly view = new Container();
  private readonly petals = new Graphics();
  private alpha = 0;
  private pulse = PULSE;
  private on = false;
  private time = 0;

  constructor(world: Container) {
    const rings = new Graphics();
    rings.ellipse(0, 0, RADIUS, RADIUS * SQUASH).stroke({ width: 8, color: GOLD, alpha: 0.85 });
    rings.ellipse(0, 0, RADIUS * 0.78, RADIUS * 0.78 * SQUASH).stroke({ width: 4, color: PALE, alpha: 0.6 });
    this.view.addChild(rings, this.petals);
    this.view.zIndex = SHADOW_Z + 1.5;
    this.view.visible = false;
    world.addChild(this.view);
  }

  update(dt: number, zen: boolean, hx: number, hy: number): void {
    if (zen && !this.on) this.pulse = 0;
    this.on = zen;
    this.time += dt;
    this.pulse = Math.min(PULSE, this.pulse + dt);
    this.alpha = zen ? Math.min(1, this.alpha + dt / FADE_IN) : Math.max(0, this.alpha - dt / FADE_OUT);
    this.view.visible = this.alpha > 0;
    if (!this.view.visible) return;
    // the pulse opens wide and settles back
    const k = 1 - this.pulse / PULSE;
    this.view.position.set(hx, hy);
    this.view.scale.set(1 + 0.5 * k * k);
    this.view.alpha = this.alpha * (0.8 + 0.2 * k);
    const g = this.petals.clear();
    for (let i = 0; i < PETALS; i++) {
      const a = this.time * TURN + (i / PETALS) * Math.PI * 2;
      if (CORGI) g.poly([...marker(a, 0.8, 0), ...marker(a, 1.12, -0.13), ...marker(a, 1.12, 0.13)]);
      else g.ellipse(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS * SQUASH, 16, 10);
    }
    g.fill({ color: GOLD });
  }
}
