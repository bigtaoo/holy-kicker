import { ColorMatrixFilter, Container, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { gridPack } from './atlasPack';
import type { SheetMeta } from './mobAnim';
import { sliceSheet, type MobSheet } from './mobView';

// Stress test for a roster of many mob types before the art exists: fakes `types` distinct
// mob textures as hue-shifted copies of one baked sheet, optionally at a lower resolution,
// each in its own texture or packed several to a shared atlas page. Distinct textures are
// what break draw batches, so this measures the real cost of a larger roster.

export function fakeMobTypes(renderer: Renderer, base: MobSheet, types: number, page: number, res: number): MobSheet[] {
  if (types === 1 && res === 1) return [base];
  const src = base.meta;
  const fw = Math.max(1, Math.round(src.frameW * res));
  const fh = Math.max(1, Math.round(src.frameH * res));
  const sx = fw / src.frameW;
  const sy = fh / src.frameH;
  const meta: SheetMeta = {
    ...src,
    frameW: fw,
    frameH: fh,
    anchor: [src.anchor[0] * sx, src.anchor[1] * sy],
    height: src.height * sy,
    lift: src.lift.map((l) => l * sy),
  };
  const rows = Math.ceil((src.flash + src.frames) / src.cols);
  const w = src.cols * fw;
  const h = rows * fh;
  const sheet = base.textures[0].source;
  const slots = page > 0 ? gridPack(w, h, types, page) : gridPack(w, h, types, Math.max(w, h)).map((s, i) => ({ ...s, page: i }));
  const pages: Texture[] = [];
  const pageCount = slots[slots.length - 1].page + 1;
  for (let p = 0; p < pageCount; p++) {
    const box = new Container();
    slots.forEach((s, i) => {
      if (s.page !== p) return;
      const copy = new Sprite({ texture: new Texture({ source: sheet }), scale: { x: sx, y: sy } });
      copy.position.set(s.x, s.y);
      const hue = new ColorMatrixFilter();
      hue.hue((i * 360) / types, false);
      copy.filters = i === 0 ? [] : [hue];
      box.addChild(copy);
    });
    const size = page > 0 ? new Rectangle(0, 0, page, page) : new Rectangle(0, 0, w, h);
    pages.push(renderer.generateTexture({ target: box, frame: size, resolution: 1 }));
    box.destroy({ children: true });
  }
  return slots.map((s) => sliceSheet(meta, pages[s.page], s.x, s.y));
}
