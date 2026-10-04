import { Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import { bakeTexture } from './bake';
import type { SheetMeta } from './mobAnim';
import { sliceSheet, type MobSheet } from './mobView';

// The ghost wisp, the chapter's swarm mob, drawn in code at start-up instead of baked from a
// picture: a pale teal flame with red eyes in the sticker style (thick dark outline, flat fill,
// one lighter core), flickering over a short loop and bobbing above the ground. The sheet has
// the same layout as a baked one (the frames, then their white hit-flash copies), so MobView
// plays it like any mob.

const FRAMES = 8;
const COLS = 4;
const W = 96;
const H = 128;
/** The flame's foot in frame px: where it would touch the ground. */
const FOOT_Y = 118;
const BODY = 0x9fe8e0;
const CORE = 0xe6fffb;
const OUTLINE = 0x163038;
const EYE = 0xff3048;

/** One flame, its tip swayed by `sway` px and its body breathing by `k`. */
function flame(g: Graphics, ox: number, oy: number, sway: number, k: number, white: boolean): void {
  const cx = ox + W / 2;
  const by = oy + FOOT_Y - 30;
  const r = 28 * k;
  const tip = { x: cx + sway, y: oy + 14 };
  const fill = white ? 0xffffff : BODY;
  g.moveTo(tip.x, tip.y)
    .bezierCurveTo(cx + r * 0.9 + sway * 0.3, by - r * 1.2, cx + r * 1.15, by - r * 0.2, cx + r, by + r * 0.35)
    .arc(cx, by, r, 0.35, Math.PI - 0.35)
    .bezierCurveTo(cx - r * 1.15, by - r * 0.2, cx - r * 0.9 + sway * 0.3, by - r * 1.2, tip.x, tip.y)
    .closePath()
    .fill(fill)
    .stroke({ color: white ? 0xffffff : OUTLINE, width: 7, join: 'round' });
  if (white) return;
  g.ellipse(cx - 6 + sway * 0.2, by - 6, r * 0.42, r * 0.62).fill(CORE);
  for (const dx of [-10, 10]) g.circle(cx + dx, by + 4, 5.5).fill(EYE).stroke({ color: OUTLINE, width: 3 });
}

export function wispSheet(renderer: Renderer): MobSheet {
  const box = new Container();
  const g = new Graphics();
  box.addChild(g);
  const lift: number[] = [];
  for (let i = 0; i < FRAMES * 2; i++) {
    const f = i % FRAMES;
    const t = (f / FRAMES) * Math.PI * 2;
    const ox = (i % COLS) * W;
    const oy = Math.floor(i / COLS) * H;
    flame(g, ox, oy, Math.sin(t) * 9, 1 + Math.sin(t * 2) * 0.04, i >= FRAMES);
    if (i < FRAMES) lift.push(8 + Math.sin(t) * 6);
  }
  const rows = Math.ceil((FRAMES * 2) / COLS);
  const tex = bakeTexture(renderer, { target: box, frame: new Rectangle(0, 0, COLS * W, rows * H), resolution: 1, antialias: true });
  box.destroy({ children: true });
  const meta: SheetMeta = {
    frames: FRAMES, flash: FRAMES, cols: COLS, frameW: W, frameH: H, fps: 10, anchor: [W / 2, FOOT_Y], height: FOOT_Y - 14, lift,
  };
  return sliceSheet(meta, tex);
}
