// What the game holds in memory, for the `perf` and `anomaly` events (server/src/protocol.ts
// PerfProps): display objects on stage and GPU textures, besides the JS heap where the host shows
// it. A leak that keeps sprites shows as nodes climbing; one that bakes or loads textures and
// never destroys them, as textures climbing; heap climbing with both flat points at plain JS
// (listeners, arrays, closures). Pure: the caller hands in the stage and the texture list.

export interface MemSample {
  /** JS heap in use, MB; undefined where the host does not say. */
  heap?: number;
  tex: number;
  texMB: number;
  nodes: number;
}

interface Node {
  children?: readonly Node[];
}

/** Display objects in the tree under `root`, `root` included. Walked without recursion: a deep tree cannot blow the stack. */
export function countNodes(root: Node): number {
  let n = 0;
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    n++;
    const kids = node.children;
    if (kids) for (let i = 0; i < kids.length; i++) stack.push(kids[i]);
  }
  return n;
}

/**
 * Texture count and size in MB (4 bytes a pixel, mipmaps left out) of a renderer's managed texture
 * sources. Pixi leaves a null where it unloaded one (GCManagedHash), so those are skipped.
 */
export function textureStats(sources: readonly ({ pixelWidth: number; pixelHeight: number } | null | undefined)[]): { tex: number; texMB: number } {
  let bytes = 0;
  let tex = 0;
  for (const s of sources) {
    if (!s) continue;
    tex++;
    bytes += (s.pixelWidth || 0) * (s.pixelHeight || 0) * 4;
  }
  return { tex, texMB: Math.round(bytes / 2 ** 20) };
}
