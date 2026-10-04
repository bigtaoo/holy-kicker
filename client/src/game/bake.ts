import type { GenerateTextureOptions, Renderer, Texture } from 'pixi.js';

// Textures a run bakes from Graphics (shadows, glows, particle and number atlases). Each one
// is GPU memory the run owns: bakeTexture records it against the renderer and releaseBaked
// frees the lot when the run ends (Game.destroy), so replaying does not pile textures up
// until a phone runs out of memory. Loaded art is not baked and stays for the next run.

const baked = new WeakMap<Renderer, Texture[]>();

export function bakeTexture(renderer: Renderer, options: GenerateTextureOptions): Texture {
  const tex = renderer.generateTexture(options);
  const list = baked.get(renderer);
  if (list) list.push(tex);
  else baked.set(renderer, [tex]);
  return tex;
}

/** Destroys every texture baked on `renderer` since the last release. */
export function releaseBaked(renderer: Renderer): void {
  for (const tex of baked.get(renderer) ?? []) tex.destroy(true);
  baked.delete(renderer);
}

/** How many baked textures `renderer` holds (for tests and leak checks). */
export function bakedCount(renderer: Renderer): number {
  return baked.get(renderer)?.length ?? 0;
}
