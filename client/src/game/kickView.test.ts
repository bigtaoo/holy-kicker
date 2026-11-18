import { Container, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { FP, KICK, newPlayer, type Flyer } from '@hk/engine';
import { FxPool } from './fx';
import { KickView } from './kickView';
import type { MobLook } from './mobView';
import { Shake } from './shake';

const look = { sheet: { textures: [Texture.WHITE] }, height: 80, facesLeft: false, shadow: [30, 10], shadowTex: Texture.WHITE } as unknown as MobLook;

function setup() {
  const world = new Container();
  const fx = new FxPool(1000);
  const view = new KickView(world, () => look, fx, new Shake(), 5000);
  const p = newPlayer(0, 0, 0);
  p.charge = 0;
  return { world, fx, view, p };
}

const body = (id: number, x: number): Flyer => ({ id, owner: 0, kind: 'chaser', x: x * FP, y: 0, px: x * FP, py: 0, vx: 50 * FP, vy: 0, travel: 1, hit: [] });

describe('kick view', () => {
  it('holds the view for the hit-stop after a kick, then lets go', () => {
    const { view, fx } = setup();
    expect(view.hold(0.016)).toBe(false);
    view.on({ type: 'holyKick', owner: 0, id: 1, x: 0, y: 0, dx: FP, dy: 0 });
    expect(fx.live.length).toBeGreaterThan(0);
    let held = 0;
    while (view.hold(0.016)) held++;
    expect(held).toBeGreaterThan(1);
    expect(held).toBeLessThan(10);
    // another player's kick does not stop this view
    view.on({ type: 'holyKick', owner: 1, id: 2, x: 0, y: 0, dx: FP, dy: 0 });
    expect(view.hold(0.016)).toBe(false);
  });

  it('draws one spinning body per flyer and drops it once it lands', () => {
    const { view, world, p } = setup();
    const before = world.children.length;
    view.draw([body(1, 100), body(2, 300)], p, 1, 0.016, 0, 0);
    expect(world.children.length).toBe(before + 2);
    view.draw([body(2, 350)], p, 1, 0.016, 0, 0);
    expect(world.children.length).toBe(before + 1);
    view.draw([], p, 1, 0.016, 0, 0);
    expect(world.children.length).toBe(before);
  });

  it('shows the chain counter from the second body and hides it after a while', () => {
    const { view, world, p } = setup();
    const counter = () => world.children.find((c) => 'text' in c) as { visible: boolean; text: string };
    view.on({ type: 'kickChain', owner: 0, n: 1, x: 0, y: 0 });
    view.draw([], p, 1, 0.016, 0, 0);
    expect(counter().visible).toBe(false);
    view.on({ type: 'kickChain', owner: 0, n: 4, x: 0, y: 0 });
    view.draw([], p, 1, 0.016, 0, 0);
    expect(counter().visible).toBe(true);
    expect(counter().text).toContain('4');
    for (let k = 0; k < 120; k++) view.draw([], p, 1, 0.016, 0, 0);
    expect(counter().visible).toBe(false);
  });

  it('draws the charge filling, full and pulsing, and nothing for a fallen hero', () => {
    const { view, p, fx } = setup();
    view.on({ type: 'kickReady', owner: 0 });
    for (const c of [0, KICK.full >> 1, KICK.full]) {
      p.charge = c;
      expect(() => view.draw([], p, 1, 0.016, 0, 0)).not.toThrow();
    }
    p.dead = true;
    view.draw([], p, 1, 0.016, 0, 0);
    view.on({ type: 'kickBurst', owner: 0, x: 0, y: 0, radius: 280 * FP, wall: true });
    expect(fx.live.filter((q) => q.shape === 'ring')).toHaveLength(3);
    view.destroy();
  });
});
