import { Container, Graphics } from 'pixi.js';
import type { Vec } from './camera';
import { ambientAt, type AmbientShape, type AmbientStyle } from './stageAmbient';

// Draws a chapter's drifting air (stageAmbient.ts) over the horde and under the hit effects:
// a few dozen small Graphics placed every frame, thinned by the run's heat at `heat()`.

const OUTLINE = 0x1a1420;

export function makeAmbient(style: AmbientStyle, cam: Vec, heat: () => number): Container {
  const view = new Container();
  view.zIndex = 1e7 - 1;
  const specks: Graphics[] = [];
  for (let i = 0; i < style.count; i++) {
    const s = ambientAt(style, i, 0, 0, 0);
    const g = speck(style.shape, s.color);
    g.scale.set(s.size / 20);
    specks.push(g);
    view.addChild(g);
  }
  const start = performance.now() / 1000;
  view.onRender = () => {
    const time = performance.now() / 1000 - start;
    const h = heat();
    specks.forEach((g, i) => {
      const s = ambientAt(style, i, time, cam.x, cam.y, h);
      g.visible = s.alpha > 0.01;
      if (!g.visible) return;
      g.position.set(s.x, s.y);
      g.rotation = s.rotation;
      g.alpha = s.alpha;
    });
  };
  return view;
}

/** One speck 20 units across. */
function speck(shape: AmbientShape, color: number): Graphics {
  switch (shape) {
    case 'leaf':
      return new Graphics()
        .moveTo(0, -12).quadraticCurveTo(10, -4, 0, 12).quadraticCurveTo(-10, -4, 0, -12).closePath()
        .fill(color).stroke({ color: OUTLINE, width: 2.5 })
        .moveTo(0, -8).lineTo(0, 9).stroke({ color: OUTLINE, width: 1.5 });
    case 'glow':
      return new Graphics().circle(0, 0, 10).fill({ color, alpha: 0.3 }).circle(0, 0, 6).fill({ color, alpha: 0.6 }).circle(0, 0, 3.5).fill(0xffffff);
    case 'flake':
      return new Graphics().poly([-7, -4, 5, -7, 8, 3, -3, 7]).fill(color);
    default:
      return new Graphics().circle(0, 0, 10).fill(color);
  }
}
