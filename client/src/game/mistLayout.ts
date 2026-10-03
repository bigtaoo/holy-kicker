// The layout of a seamless mist tile: soft blobs of varying size and strength scattered over a
// square tile, with every blob that crosses an edge copied to the far side, so the tile repeats
// without seams. Pure, so the scatter is tested away from Pixi (mistView.ts bakes it).

export interface MistBlob {
  x: number;
  y: number;
  r: number;
  /** Peak opacity at the blob's centre, 0..1. */
  a: number;
}

export interface MistTile {
  /** Tile side in px. */
  size: number;
  count: number;
  /** Blob radius range, as a fraction of the tile. */
  minR: number;
  maxR: number;
  seed: number;
}

/** The blobs of one tile, wrap copies included, in a fixed order for the seed. */
export function mistBlobs(tile: MistTile): MistBlob[] {
  let seed = tile.seed;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: MistBlob[] = [];
  const s = tile.size;
  for (let i = 0; i < tile.count; i++) {
    const x = rand() * s;
    const y = rand() * s;
    const r = (tile.minR + rand() * (tile.maxR - tile.minR)) * s;
    const a = 0.5 + rand() * 0.5;
    for (const dx of [-s, 0, s]) {
      for (const dy of [-s, 0, s]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + r > 0 && cx - r < s && cy + r > 0 && cy - r < s) out.push({ x: cx, y: cy, r, a });
      }
    }
  }
  return out;
}
