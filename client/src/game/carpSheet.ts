import type { Graphics, Renderer } from 'pixi.js';
import { bakeSheet } from './marshSheets';
import type { MobSheet } from './mobView';

// The Black Carp King, chapter 2's boss, drawn in code at start-up like the marsh mobs
// (marshSheets.ts) until it gets its own rig: a huge ink-slate carp standing up out of the
// shallows on its tail, a purple dorsal fin down its back, thick lips trailing two long
// barbels, red eyes under an angry brow and a jade crown. Its tail swishes behind it, its
// fins flap, and the water laps round its foot. Faces left, in the sticker style.

const C = {
  body: 0x34404f, belly: 0x8fb0b4, scale: 0x232c38, fin: 0x6a55a0, lip: 0x55406a,
  crown: 0x86e0c8, crownShade: 0x4fae9a, water: 0x9fe0e6, outline: 0x0c1118, eye: 0xff3048,
};

function carp(g: Graphics, ox: number, oy: number, t: number, white: boolean): void {
  const c = (col: number) => (white ? 0xffffff : col);
  const line = { color: c(C.outline), width: 7, join: 'round' as const, cap: 'round' as const };
  const cx = ox + 112;
  const foot = oy + 228 + Math.sin(t * 2) * 2;
  const sway = Math.sin(t) * 4;
  // the tail, swishing behind
  const a = Math.sin(t) * 0.35;
  const tx = cx + 44;
  const ty = foot - 34;
  const tail = [[0, 0], [62, -46], [46, -6], [74, 20], [0, 14]].flatMap(([x, y]) => [
    tx + x * Math.cos(a) - y * Math.sin(a), ty + x * Math.sin(a) + y * Math.cos(a),
  ]);
  g.poly(tail, true).fill(c(C.fin)).stroke(line);
  // the dorsal fin down its back
  g.poly([cx + 36, foot - 178, cx + 78, foot - 172, cx + 66, foot - 150, cx + 90, foot - 136, cx + 70, foot - 118,
    cx + 88, foot - 100, cx + 58, foot - 84], true).fill(c(C.fin)).stroke(line);
  g.ellipse(cx, foot - 100, 62, 100).fill(c(C.body)).stroke(line);
  if (!white) {
    g.ellipse(cx - 24, foot - 84, 30, 72).fill(C.belly);
    for (const [x, y] of [[10, -132], [34, -120], [14, -98], [38, -86], [18, -64], [40, -56]]) {
      g.moveTo(cx + x + 10 * Math.cos(0.3), foot + y + 10 * Math.sin(0.3)).arc(cx + x, foot + y, 10, 0.3, Math.PI - 0.3)
        .stroke({ color: C.scale, width: 4, cap: 'round' });
    }
  }
  // the pectoral fin, flapping
  const flap = Math.sin(t * 2) * 8;
  g.poly([cx - 18, foot - 102, cx - 60, foot - 84 + flap, cx - 52, foot - 66 + flap, cx - 16, foot - 82], true).fill(c(C.fin)).stroke({ ...line, width: 5 });
  // the head: barbels, lips, brow and eye, crown
  const hx = cx + sway * 0.5;
  for (const k of [0, 1]) {
    const w = Math.sin(t + k) * 6;
    const bx = hx - 60;
    const by = foot - 140 + k * 8;
    g.moveTo(bx, by).quadraticCurveTo(bx - 34 + w, by + 18, bx - 26 + w, by + 54).stroke({ ...line, width: 10 });
    g.moveTo(bx, by).quadraticCurveTo(bx - 34 + w, by + 18, bx - 26 + w, by + 54).stroke({ color: c(C.lip), width: 4, cap: 'round' });
  }
  g.ellipse(hx - 56, foot - 150, 15, 11).fill(c(C.lip)).stroke({ ...line, width: 5 });
  if (!white) {
    g.moveTo(hx - 70, foot - 150).lineTo(hx - 46, foot - 150).stroke({ color: C.outline, width: 4, cap: 'round' });
    g.circle(hx - 30, foot - 166, 10).fill(C.eye).stroke({ color: C.outline, width: 4 });
    g.circle(hx - 32, foot - 166, 3.5).fill(C.outline);
    g.moveTo(hx - 46, foot - 184).lineTo(hx - 18, foot - 176).stroke({ color: C.outline, width: 7, cap: 'round' });
  }
  const kx = hx - 6;
  const ky = foot - 192;
  g.poly([kx - 20, ky, kx - 22, ky - 26, kx - 10, ky - 12, kx, ky - 30, kx + 10, ky - 12, kx + 22, ky - 26, kx + 20, ky], true)
    .fill(c(C.crown)).stroke({ ...line, width: 5 });
  if (!white) g.rect(kx - 18, ky - 7, 36, 6).fill(C.crownShade);
  // the shallows lapping round its foot
  if (!white) g.ellipse(cx, foot - 6, 78, 16).fill({ color: C.water, alpha: 0.55 }).stroke({ color: 0xe6fbff, width: 3, alpha: 0.8 });
}

export function carpSheet(renderer: Renderer): MobSheet {
  return bakeSheet(renderer, { w: 250, h: 252, foot: 228, height: 224, fps: 7, draw: carp, lift: () => 0 });
}
