import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { scatterDeco, type DecoKind } from './deco';

// Draws the scattered ground decorations from one sheet (tools/pack_deco.py), in a single
// container lying on the ground tile under every figure, so it adds one batch and no sorting.

export interface DecoFrame {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DecoSheet {
  frames: Map<string, Texture>;
}

/** Props by how often they appear and how big they are; tufts carry most of the variety. */
export const DECO_KINDS: readonly DecoKind[] = [
  { name: 'grass_tuft', weight: 5, size: 95 },
  { name: 'bush', weight: 2, size: 110 },
  { name: 'rocks', weight: 2, size: 105 },
  { name: 'dirt_patch', weight: 2, size: 190 },
  { name: 'stump', weight: 1, size: 105 },
  { name: 'gravestone', weight: 1, size: 100 },
];

/** Props sit back a little so mobs and gems stay the brightest things on the grass. */
const PROP_TINT = 0xc8ccc4;
/** Flat decals sink further into the grass. */
const DECAL: Record<string, { tint: number; alpha: number }> = { dirt_patch: { tint: 0x8c8a6a, alpha: 0.7 } };
const PATCH_DARK = { tint: 0x101a0c, alpha: 0.38 };
const PATCH_LIGHT = { tint: 0xc0c878, alpha: 0.16 };

export function sliceDeco(frames: readonly DecoFrame[], sheet: Texture): DecoSheet {
  const out = new Map<string, Texture>();
  for (const f of frames) {
    out.set(f.name, new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
  }
  return { frames: out };
}

/** Patches only, or patches and props. Kinds missing from the sheet are left out. */
export function makeDeco(sheet: DecoSheet, props: boolean): Container {
  const view = new Container();
  const kinds = DECO_KINDS.filter((k) => props && sheet.frames.has(k.name));
  const patch = sheet.frames.get('patch');
  for (const d of scatterDeco(kinds)) {
    const tex = d.kind < 0 ? patch : sheet.frames.get(kinds[d.kind].name);
    if (!tex) continue;
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.position.set(d.x, d.y);
    const k = d.size / Math.max(tex.width, tex.height);
    if (d.kind < 0) {
      const look = d.dark ? PATCH_DARK : PATCH_LIGHT;
      // flattened so patches read as lying on the ground, not as round blobs
      s.scale.set(k * (d.flip ? 1.4 : 1.1), k * 0.75);
      s.tint = look.tint;
      s.alpha = look.alpha;
    } else {
      s.scale.set(d.flip ? -k : k, k);
      const decal = DECAL[kinds[d.kind].name];
      s.tint = decal?.tint ?? PROP_TINT;
      s.alpha = decal?.alpha ?? 1;
    }
    view.addChild(s);
  }
  return view;
}
