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

/** How a stage scatters its props and tints its faint patches. */
export interface DecoStyle {
  /** Props by how often they appear and how big they are. */
  kinds: readonly DecoKind[];
  /** Props sit back a little so mobs and gems stay the brightest things on the ground. */
  tint: number;
  /** Flat decals sink further into the ground. */
  decal: Readonly<Record<string, { tint: number; alpha: number }>>;
  dark: { tint: number; alpha: number };
  light: { tint: number; alpha: number };
}

/** Chapter 1, the ruined temple's grass; tufts carry most of the variety. */
export const TEMPLE_DECO: DecoStyle = {
  kinds: [
    { name: 'grass_tuft', weight: 5, size: 95 },
    { name: 'bush', weight: 2, size: 110 },
    { name: 'rocks', weight: 2, size: 105 },
    { name: 'dirt_patch', weight: 2, size: 190 },
    { name: 'stump', weight: 1, size: 105 },
    { name: 'gravestone', weight: 1, size: 100 },
  ],
  tint: 0xc8ccc4,
  decal: { dirt_patch: { tint: 0x8c8a6a, alpha: 0.7 } },
  dark: { tint: 0x101a0c, alpha: 0.38 },
  light: { tint: 0xc0c878, alpha: 0.16 },
};

/** Chapter 2, the misty marsh: reeds most of all, puddles and lily pads lying flat in the mud,
 * and patches that lean to cold water green so the bog reads damp and misty. */
export const MARSH_DECO: DecoStyle = {
  kinds: [
    { name: 'reeds', weight: 5, size: 115 },
    { name: 'puddle', weight: 3, size: 200 },
    { name: 'lily', weight: 2, size: 120 },
    { name: 'mossrock', weight: 2, size: 110 },
    { name: 'log', weight: 1, size: 120 },
    { name: 'lantern', weight: 1, size: 110 },
  ],
  tint: 0xbcc8c4,
  decal: { puddle: { tint: 0x9aaaa6, alpha: 0.8 }, lily: { tint: 0xb4c4bc, alpha: 0.9 } },
  dark: { tint: 0x08140f, alpha: 0.4 },
  light: { tint: 0x9cc4b8, alpha: 0.14 },
};

/** Chapter 3, the snow pass at dusk: snowy pines and rocks, bare shrubs, cairns, and ice
 * lying flat; the patches lean cold blue so the drifts read under the twilight. */
export const SNOW_DECO: DecoStyle = {
  kinds: [
    { name: 'pine', weight: 4, size: 130 },
    { name: 'snowrock', weight: 3, size: 115 },
    { name: 'shrub', weight: 3, size: 110 },
    { name: 'ice', weight: 2, size: 190 },
    { name: 'stump', weight: 1, size: 100 },
    { name: 'cairn', weight: 1, size: 110 },
  ],
  tint: 0xa8b4c8,
  decal: { ice: { tint: 0x8c9cb8, alpha: 0.75 } },
  dark: { tint: 0x0a1020, alpha: 0.38 },
  light: { tint: 0xb8c8e8, alpha: 0.16 },
};

/** Chapter 4, the ghost market at night: blue lantern posts, empty stalls, jars, crates and
 * incense burners on the flagstones, spirit money lying flat; the patches lean to a cold teal
 * so the lantern light seems to pool on the street. */
export const GHOST_DECO: DecoStyle = {
  kinds: [
    { name: 'lantern_post', weight: 3, size: 140 },
    { name: 'papers', weight: 3, size: 150 },
    { name: 'jars', weight: 2, size: 110 },
    { name: 'crates', weight: 2, size: 115 },
    { name: 'stall', weight: 1, size: 150 },
    { name: 'burner', weight: 1, size: 105 },
  ],
  tint: 0xb0b8cc,
  decal: { papers: { tint: 0x9ca4bc, alpha: 0.8 } },
  dark: { tint: 0x080c18, alpha: 0.4 },
  light: { tint: 0x80d8e8, alpha: 0.14 },
};

export function sliceDeco(frames: readonly DecoFrame[], sheet: Texture): DecoSheet {
  const out = new Map<string, Texture>();
  for (const f of frames) {
    out.set(f.name, new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
  }
  return { frames: out };
}

/** Patches only, or patches and props. Kinds missing from the sheet are left out. */
export function makeDeco(sheet: DecoSheet, props: boolean, style: DecoStyle = TEMPLE_DECO): Container {
  const view = new Container();
  const kinds = style.kinds.filter((k) => props && sheet.frames.has(k.name));
  const patch = sheet.frames.get('patch');
  for (const d of scatterDeco(kinds)) {
    const tex = d.kind < 0 ? patch : sheet.frames.get(kinds[d.kind].name);
    if (!tex) continue;
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.position.set(d.x, d.y);
    const k = d.size / Math.max(tex.width, tex.height);
    if (d.kind < 0) {
      const look = d.dark ? style.dark : style.light;
      // flattened so patches read as lying on the ground, not as round blobs
      s.scale.set(k * (d.flip ? 1.4 : 1.1), k * 0.75);
      s.tint = look.tint;
      s.alpha = look.alpha;
    } else {
      s.scale.set(d.flip ? -k : k, k);
      const decal = style.decal[kinds[d.kind].name];
      s.tint = decal?.tint ?? style.tint;
      s.alpha = decal?.alpha ?? 1;
    }
    view.addChild(s);
  }
  return view;
}
