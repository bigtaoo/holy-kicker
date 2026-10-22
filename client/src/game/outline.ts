import { Container, Rectangle, Sprite, type Renderer } from 'pixi.js';
import { bakeTexture } from './bake';
import type { SheetMeta } from './mobAnim';
import { sliceSheet, type MobSheet } from './mobView';

// The elites' sticker edge: a pale cold rim around the big foes, so they stand out of the
// dark horde on the dark ground (the plain mobs go without: on all of them it glared). The
// chapter elites have it baked into their sheets (tools/bake_mob.py "outline"); the jiangshi,
// whose sheet the horde draws plain, gets it baked when a run
// starts, from the sheet's own white flash copies (stamped around the frame in a ring, tinted,
// under the frame), into a sheet whose frames are padded so a rim never bleeds into the next.

export interface OutlineStyle {
  /** Rim width in sheet px. */
  px: number;
  color: number;
  /** Stamps around the ring; more is rounder. */
  steps: number;
}

/** Pale teal-white: cold like the enemies, and far from the hero's saffron. */
export const ELITE_OUTLINE: OutlineStyle = { px: 7, color: 0xe2f2ee, steps: 12 };

/** `meta` with every frame grown by `pad` on each side (the drawing stays where it was in it). */
export function paddedMeta(meta: SheetMeta, pad: number): SheetMeta {
  return { ...meta, frameW: meta.frameW + 2 * pad, frameH: meta.frameH + 2 * pad, anchor: [meta.anchor[0] + pad, meta.anchor[1] + pad] };
}

/** Offsets of the stamps that draw a rim `px` wide. */
export function rimOffsets(px: number, steps: number): [number, number][] {
  return Array.from({ length: steps }, (_, i): [number, number] => {
    const a = (i / steps) * Math.PI * 2;
    return [Math.cos(a) * px, Math.sin(a) * px];
  });
}

/** A copy of `sheet` with a rim round every frame; its flash copies flash rim and all. */
export function outlineSheet(renderer: Renderer, sheet: MobSheet, style = ELITE_OUTLINE): MobSheet {
  const { meta, textures } = sheet;
  const out = paddedMeta(meta, style.px);
  const rim = rimOffsets(style.px, style.steps);
  const box = new Container();
  textures.forEach((tex, i) => {
    const x = (i % meta.cols) * out.frameW + style.px;
    const y = Math.floor(i / meta.cols) * out.frameH + style.px;
    const white = i >= meta.flash;
    const silhouette = white ? tex : (textures[i + meta.flash] ?? tex);
    for (const [dx, dy] of rim) {
      box.addChild(new Sprite({ texture: silhouette, position: { x: x + dx, y: y + dy }, tint: white ? 0xffffff : style.color }));
    }
    box.addChild(new Sprite({ texture: tex, position: { x, y } }));
  });
  const rows = Math.ceil(textures.length / meta.cols);
  const page = bakeTexture(renderer, { target: box, frame: new Rectangle(0, 0, meta.cols * out.frameW, rows * out.frameH), resolution: 1, antialias: true });
  return sliceSheet(out, page);
}
