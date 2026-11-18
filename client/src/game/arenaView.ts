import { Container, Graphics } from 'pixi.js';
import { ARENA_GATES, FP } from '@hk/engine';
import { GATE_OPEN, HALF, WALL, gatePosts, wallPieces } from './arenaWalls';

// The arena's walls on the ground (docs/design.md "Arena"): the field outside them darkened, a
// thick-outlined stone band with a hard shadow line, and at every gate two posts round a cold glow,
// where the horde comes in (enemies are cold, so is their way in).

const OUTSIDE = 0x0b0d14;
const STONE = 0x8c8478;
const STONE_TOP = 0xb3aa9c;
const POST = 0x5f584f;
const OUTLINE = 0x1d1a17;
const GATE_GLOW = 0x5a3c8c;
/** How far past the walls the darkness reaches: past any screen, whatever the zoom. */
const FAR = 6000;

/** The walls, posts, gate glows and the darkened outside, in world units, to lie flat on the ground. */
export function arenaWalls(): Container {
  const view = new Container();
  const dark = new Graphics();
  const edge = HALF + WALL;
  // four bands round the square: above and below run full width, the sides fill between them
  dark.rect(-FAR, -FAR, 2 * FAR, FAR - edge).rect(-FAR, edge, 2 * FAR, FAR - edge);
  dark.rect(-FAR, -edge, FAR - edge, 2 * edge).rect(edge, -edge, FAR - edge, 2 * edge);
  dark.fill({ color: OUTSIDE, alpha: 0.55 });
  const glow = new Graphics();
  for (const g of ARENA_GATES) {
    const gx = g.x / FP;
    const gy = g.y / FP;
    const side = Math.abs(gx) === HALF;
    const w = side ? WALL + 160 : GATE_OPEN;
    const h = side ? GATE_OPEN : WALL + 160;
    glow.ellipse(gx, gy, w / 2, h / 2).fill({ color: GATE_GLOW, alpha: 0.35 });
  }
  const walls = new Graphics();
  for (const r of wallPieces()) {
    walls.rect(r.x, r.y, r.w, r.h).fill(STONE).stroke({ color: OUTLINE, width: 8, alignment: 1 });
    // the lit top edge and the hard cel shadow along the bottom
    walls.rect(r.x + 6, r.y + 6, r.w - 12, 10).fill(STONE_TOP);
    walls.rect(r.x + 4, r.y + r.h - 14, r.w - 8, 10).fill({ color: OUTLINE, alpha: 0.35 });
  }
  for (const p of gatePosts()) {
    walls.roundRect(p.x, p.y, p.w, p.h, 12).fill(POST).stroke({ color: OUTLINE, width: 8, alignment: 1 });
    walls.roundRect(p.x + 10, p.y + 10, p.w - 20, 12, 6).fill(STONE_TOP);
  }
  view.addChild(dark, glow, walls);
  return view;
}
