import { Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import type { SheetMeta } from './mobAnim';
import { sliceSheet, type MobSheet } from './mobView';

// Chapter 2's mobs, drawn in code at start-up like the wisp (wispSheet.ts) until their art is
// baked: the water ghost, a drowned figure in a grey-blue robe with a curtain of dark hair,
// drifting on a rippling hem with its arms reaching out; and the toad, a squat purple-grey
// toad with red eyes that hops; and the toad king, a bigger slate-teal toad with a jade crown.
// All face left, in the sticker style (thick dark outline,
// flat fills, red eyes), on a sheet laid out like a baked one (the frames, then white copies).

const FRAMES = 8;
const COLS = 4;
const EYE = 0xff3048;

export interface Spec {
  w: number;
  h: number;
  /** The figure's foot in frame px. */
  foot: number;
  /** The figure's own height in frame px (what MobView scales to the world height). */
  height: number;
  fps: number;
  draw: (g: Graphics, ox: number, oy: number, t: number, white: boolean) => void;
  lift: (t: number) => number;
}

export function bakeSheet(renderer: Renderer, spec: Spec): MobSheet {
  const box = new Container();
  const g = new Graphics();
  box.addChild(g);
  const lift: number[] = [];
  for (let i = 0; i < FRAMES * 2; i++) {
    const t = ((i % FRAMES) / FRAMES) * Math.PI * 2;
    spec.draw(g, (i % COLS) * spec.w, Math.floor(i / COLS) * spec.h, t, i >= FRAMES);
    if (i < FRAMES) lift.push(spec.lift(t));
  }
  const rows = Math.ceil((FRAMES * 2) / COLS);
  const tex = renderer.generateTexture({ target: box, frame: new Rectangle(0, 0, COLS * spec.w, rows * spec.h), resolution: 1, antialias: true });
  box.destroy({ children: true });
  const meta: SheetMeta = {
    frames: FRAMES, flash: FRAMES, cols: COLS, frameW: spec.w, frameH: spec.h, fps: spec.fps,
    anchor: [spec.w / 2, spec.foot], height: spec.height, lift,
  };
  return sliceSheet(meta, tex);
}

const GHOST = { robe: 0x5f7d99, robeDark: 0x46607a, skin: 0x86d8c4, hair: 0x1d2542, outline: 0x131a28 };

function ghost(g: Graphics, ox: number, oy: number, t: number, white: boolean): void {
  const c = (col: number) => (white ? 0xffffff : col);
  const line = { color: c(GHOST.outline), width: 6, join: 'round' as const, cap: 'round' as const };
  const cx = ox + 54;
  const bob = Math.sin(t) * 3;
  const top = oy + 22 + bob;
  // the back arm, behind the robe
  const reach = Math.sin(t) * 4;
  g.moveTo(cx - 6, top + 46).lineTo(cx - 40 + reach, top + 58).stroke({ ...line, width: 18 });
  g.moveTo(cx - 6, top + 46).lineTo(cx - 40 + reach, top + 58).stroke({ color: c(GHOST.robeDark), width: 10, cap: 'round' });
  g.circle(cx - 42 + reach, top + 59, 7).fill(c(GHOST.skin)).stroke({ ...line, width: 4 });
  // the robe, its hem rippling
  const hem: number[] = [];
  for (let k = 0; k <= 6; k++) {
    const x = cx + 26 - k * 9.5;
    const y = oy + 116 + (k % 2 === 0 ? 0 : -9) + Math.sin(t * 2 + k) * 3;
    hem.push(x, y);
  }
  g.poly([cx - 18, top + 30, cx + 16, top + 28, cx + 30, top + 66, ...hem, cx - 32, top + 68], true)
    .fill(c(GHOST.robe)).stroke(line);
  if (!white) g.moveTo(cx - 6, top + 34).lineTo(cx + 2, top + 64).stroke({ color: GHOST.robeDark, width: 4, cap: 'round' });
  // the head and its curtain of hair, hanging down the back
  g.circle(cx - 4, top + 16, 19).fill(c(GHOST.skin)).stroke(line);
  const sway = Math.sin(t + 0.6) * 3;
  g.poly([
    cx - 22, top + 12, cx - 16, top - 4, cx - 2, top - 8, cx + 14, top - 4, cx + 22, top + 8,
    cx + 26 + sway, top + 40, cx + 24 + sway, top + 58, cx + 14 + sway, top + 48, cx + 8, top + 56,
    cx + 4, top + 30, cx - 2, top + 10, cx - 14, top + 14, cx - 20, top + 22,
  ], true).fill(c(GHOST.hair)).stroke(line);
  if (white) return;
  for (const dx of [-15, -5]) g.circle(cx + dx, top + 19, 3.6).fill(EYE).stroke({ color: GHOST.outline, width: 2 });
  // the front arm, reaching
  g.moveTo(cx + 2, top + 42).lineTo(cx - 34 - reach, top + 48).stroke({ ...line, width: 18 });
  g.moveTo(cx + 2, top + 42).lineTo(cx - 34 - reach, top + 48).stroke({ color: GHOST.robe, width: 10, cap: 'round' });
  g.circle(cx - 37 - reach, top + 48, 7.5).fill(GHOST.skin).stroke({ ...line, width: 4 });
}

interface ToadColors {
  body: number;
  belly: number;
  spot: number;
  outline: number;
}

const TOAD: ToadColors = { body: 0x7b6d9e, belly: 0xbdb4d6, spot: 0x5b4f7e, outline: 0x19131f };
const KING: ToadColors = { body: 0x4f7480, belly: 0x9fc4c2, spot: 0x355864, outline: 0x0f1a1f };
const CROWN = { fill: 0x86e0c8, shade: 0x4fae9a };

function toad(g: Graphics, ox: number, oy: number, t: number, white: boolean, col: ToadColors = TOAD): void {
  const c = (col: number) => (white ? 0xffffff : col);
  const line = { color: c(col.outline), width: 6, join: 'round' as const };
  const cx = ox + 64;
  // a hop: squat on the ground, stretched in the air
  const air = Math.max(0, Math.sin(t));
  const lift = air * 14;
  const sy = 1 + air * 0.1 - (1 - air) * 0.04;
  const sx = 1 / sy;
  const base = oy + 100 - lift;
  // back leg, then the body over it
  g.ellipse(cx + 28, base - 6, 18 * sx, 11).fill(c(col.body)).stroke(line);
  g.ellipse(cx, base - 26 * sy, 42 * sx, 27 * sy).fill(c(col.body)).stroke(line);
  if (!white) {
    g.ellipse(cx - 6, base - 16 * sy, 28 * sx, 12 * sy).fill(col.belly);
    for (const [dx, dy, r] of [[14, -40, 6], [26, -28, 5], [2, -46, 4]]) g.circle(cx + dx * sx, base + dy * sy, r).fill(col.spot);
    g.moveTo(cx - 40 * sx, base - 26 * sy).quadraticCurveTo(cx - 28 * sx, base - 18 * sy, cx - 12 * sx, base - 24 * sy)
      .stroke({ color: col.outline, width: 4, cap: 'round' });
  }
  // front feet
  for (const dx of [-30, -14]) g.ellipse(cx + dx * sx, base - 2, 9, 6).fill(c(col.body)).stroke({ ...line, width: 4 });
  // eye bumps on top, toward the front
  for (const dx of [-24, -6]) {
    const ex = cx + dx * sx;
    const ey = base - 50 * sy;
    g.circle(ex, ey, 10).fill(c(col.body)).stroke(line);
    if (!white) g.circle(ex - 1, ey, 5).fill(EYE).stroke({ color: col.outline, width: 2 });
  }
}

/** The toad king: the toad in its own colours, with a three-pointed jade crown between its eyes. */
function toadKing(g: Graphics, ox: number, oy: number, t: number, white: boolean): void {
  toad(g, ox, oy + 14, t, white, KING);
  const c = (col: number) => (white ? 0xffffff : col);
  const air = Math.max(0, Math.sin(t));
  const sy = 1 + air * 0.1 - (1 - air) * 0.04;
  const cx = ox + 64 - 15 / sy;
  const base = oy + 114 - air * 14 - 56 * sy;
  g.poly([cx - 15, base, cx - 17, base - 20, cx - 8, base - 10, cx, base - 24, cx + 8, base - 10, cx + 17, base - 20, cx + 15, base], true)
    .fill(c(CROWN.fill)).stroke({ color: c(KING.outline), width: 5, join: 'round' });
  if (!white) g.rect(cx - 14, base - 6, 28, 5).fill(CROWN.shade);
}

export function waterGhostSheet(renderer: Renderer): MobSheet {
  return bakeSheet(renderer, { w: 112, h: 136, foot: 124, height: 112, fps: 8, draw: ghost, lift: (t) => 4 + Math.sin(t) * 3 });
}

export function toadSheet(renderer: Renderer): MobSheet {
  return bakeSheet(renderer, { w: 128, h: 112, foot: 102, height: 72, fps: 9, draw: (g, x, y, t, w) => toad(g, x, y, t, w), lift: (t) => Math.max(0, Math.sin(t)) * 14 });
}

export function toadKingSheet(renderer: Renderer): MobSheet {
  return bakeSheet(renderer, { w: 128, h: 126, foot: 116, height: 96, fps: 7, draw: toadKing, lift: (t) => Math.max(0, Math.sin(t)) * 14 });
}
