import { Container, Graphics } from 'pixi.js';
import { ARENA_GATES, FP } from '@hk/engine';
import { GATE_OPEN, HALF, WALL, gatePosts, wallPieces, type Rect } from './arenaWalls';

// The arena's walls on the ground (docs/design.md "Arena"), in the sticker style: the field outside
// them darkened, deeper right behind the wall; a thick-outlined wall of dressed stone blocks in two
// staggered courses, each block lit along its top-left edge, casting one hard shadow down and right;
// and at every gate two capped pillars round a soft cold glow, where the horde comes in (enemies are
// cold, so is their way in). The stone is a neutral grey, neither the hero's warm nor the horde's cold.

const OUTSIDE = 0x0b0d14;
const STONE = 0x8e8b88;
const STONE_LIT = 0xb9b6b1;
const MORTAR = 0x4a4846;
const PILLAR = 0x6c6966;
const CAP = 0xa29f9a;
const OUTLINE = 0x1d1a17;
const GATE_GLOW = 0x6a4cc0;
const GATE_RING = 0x9a86e8;
/** How far past the walls the darkness reaches: past any screen, whatever the zoom. */
const FAR = 6000;
/** A block's length along the wall; the two courses are offset by half of it. */
const BLOCK = 104;
/** The hard shadow's offset, down and right (light from the top left). */
const SHADOW_X = 10;
const SHADOW_Y = 18;

/** The four bands round the square from `edge` out to FAR. */
function ring(g: Graphics, edge: number): Graphics {
  g.rect(-FAR, -FAR, 2 * FAR, FAR - edge).rect(-FAR, edge, 2 * FAR, FAR - edge);
  return g.rect(-FAR, -edge, FAR - edge, 2 * edge).rect(edge, -edge, FAR - edge, 2 * edge);
}

/** One wall piece: two courses of staggered blocks, mortar between, each block lit on its top and left. */
function stones(g: Graphics, r: Rect): void {
  const horizontal = r.w >= r.h;
  const len = horizontal ? r.w : r.h;
  const course = (horizontal ? r.h : r.w) / 2;
  for (let c = 0; c < 2; c++) {
    // the blocks are laid from the world's grid, so pieces either side of a gate line up
    const start = horizontal ? r.x : r.y;
    const shift = c * (BLOCK / 2);
    let a = start;
    while (a < start + len) {
      const next = Math.min(start + len, Math.floor((a - shift) / BLOCK + 1) * BLOCK + shift);
      const b = horizontal
        ? { x: a, y: r.y + c * course, w: next - a, h: course }
        : { x: r.x + c * course, y: a, w: course, h: next - a };
      g.rect(b.x + 2, b.y + 2, b.w - 4, b.h - 4).fill(STONE);
      // the lit top and left edges, the sticker's one highlight
      g.rect(b.x + 4, b.y + 4, b.w - 8, 6).fill(STONE_LIT);
      g.rect(b.x + 4, b.y + 4, 6, b.h - 8).fill(STONE_LIT);
      a = next;
    }
  }
}

/** The walls, pillars, gate glows and the darkened outside, in world units, to lie flat on the ground. */
export function arenaWalls(): Container {
  const view = new Container();
  const edge = HALF + WALL;
  const dark = ring(new Graphics(), edge).fill({ color: OUTSIDE, alpha: 0.5 });
  // a deeper band right behind the wall, so the stone stands against the night outside
  // in three steps, so it fades out rather than ending on a line
  for (const d of [40, 80, 120]) {
    dark.rect(-edge - d, -edge - d, 2 * (edge + d), d).rect(-edge - d, edge, 2 * (edge + d), d);
    dark.rect(-edge - d, -edge, d, 2 * edge).rect(edge, -edge, d, 2 * edge);
    dark.fill({ color: OUTSIDE, alpha: 0.09 });
  }

  const glow = new Graphics();
  for (const g of ARENA_GATES) {
    const gx = g.x / FP;
    const gy = g.y / FP;
    const side = Math.abs(gx) === HALF;
    const w = side ? WALL + 200 : GATE_OPEN;
    const h = side ? GATE_OPEN : WALL + 200;
    // a soft falloff in a few steps, brightest at the threshold, and a thin ring round its heart
    for (const [k, a] of [[1, 0.1], [0.8, 0.1], [0.6, 0.12], [0.4, 0.14]] as const) glow.ellipse(gx, gy, (w / 2) * k, (h / 2) * k).fill({ color: GATE_GLOW, alpha: a });
    glow.ellipse(gx, gy, (w / 2) * 0.55, (h / 2) * 0.55).stroke({ color: GATE_RING, width: 5, alpha: 0.45 });
  }

  const walls = new Graphics();
  const pieces = wallPieces();
  const posts = gatePosts();
  // the one hard shadow, down and right, under the stone
  for (const r of [...pieces, ...posts]) walls.rect(r.x + SHADOW_X, r.y + SHADOW_Y, r.w, r.h);
  walls.fill({ color: OUTLINE, alpha: 0.32 });
  for (const r of pieces) {
    walls.rect(r.x, r.y, r.w, r.h).fill(MORTAR).stroke({ color: OUTLINE, width: 8, alignment: 1 });
    stones(walls, r);
  }
  for (const p of posts) {
    // a pillar: a dark plinth, a lighter stepped cap, a cross groove on its top
    walls.roundRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12, 14).fill(PILLAR).stroke({ color: OUTLINE, width: 8, alignment: 1 });
    walls.roundRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16, 10).fill(CAP).stroke({ color: OUTLINE, width: 5, alignment: 1 });
    walls.roundRect(p.x + 14, p.y + 14, p.w - 28, 8, 4).fill(STONE_LIT);
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    walls.rect(cx - 2, p.y + 26, 4, p.h - 40).rect(p.x + 20, cy + 2, p.w - 40, 4).fill({ color: MORTAR, alpha: 0.8 });
  }
  view.addChild(dark, glow, walls);
  return view;
}
