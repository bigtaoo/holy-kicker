// Ground decorations scattered over the field to break up the repeating grass tile: small
// props (tufts, rocks, stumps) and large faint colour patches whose size has nothing to do
// with the tile period. Pure placement; drawn by decoView.ts under every figure.

export interface DecoKind {
  name: string;
  /** Relative chance among the props. */
  weight: number;
  /** Drawn size, longest side in world units. */
  size: number;
}

export interface DecoParams {
  /** Half the field side, world units. */
  field: number;
  /** One jittered grid cell per possible prop. */
  cell: number;
  /** Chance a cell gets a prop. */
  fill: number;
  /** Faint patches: grid cell, and the patch size range in world units. */
  patchCell: number;
  patchMin: number;
  patchMax: number;
}

export const DECO: DecoParams = { field: 4000, cell: 300, fill: 0.6, patchCell: 1000, patchMin: 1100, patchMax: 2200 };

export interface DecoItem {
  /** Index into the kinds, or -1 for a faint patch. */
  kind: number;
  x: number;
  y: number;
  /** Longest side in world units. */
  size: number;
  flip: boolean;
  /** Patches only: darker (true) or lighter grass. */
  dark: boolean;
}

/** Park-Miller, so a seed always gives the same field. */
export function seeded(seed: number): () => number {
  let s = Math.max(1, Math.floor(seed) % 2147483647);
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Faint patches first (they lie lowest), then props, both on a jittered grid so neither
 * clumps nor lines up. Props keep a clear area round the start. */
export function scatterDeco(kinds: readonly DecoKind[], p: DecoParams = DECO, seed = 7, clear = 250): DecoItem[] {
  const rand = seeded(seed);
  const out: DecoItem[] = [];
  const grid = (cell: number, each: (x: number, y: number) => void) => {
    for (let y = -p.field; y < p.field; y += cell) {
      for (let x = -p.field; x < p.field; x += cell) each(x + rand() * cell, y + rand() * cell);
    }
  };
  grid(p.patchCell, (x, y) => {
    out.push({ kind: -1, x, y, size: p.patchMin + rand() * (p.patchMax - p.patchMin), flip: rand() < 0.5, dark: rand() < 0.6 });
  });
  const total = kinds.reduce((s, k) => s + k.weight, 0);
  if (total <= 0) return out;
  grid(p.cell, (x, y) => {
    const keep = rand() < p.fill;
    const pick = rand() * total;
    const scale = 0.8 + rand() * 0.4;
    const flip = rand() < 0.5;
    if (!keep || x * x + y * y < clear * clear) return;
    let kind = 0;
    for (let acc = kinds[0].weight; acc <= pick && kind < kinds.length - 1; acc += kinds[++kind].weight);
    out.push({ kind, x, y, size: kinds[kind].size * scale, flip, dark: false });
  });
  return out;
}
