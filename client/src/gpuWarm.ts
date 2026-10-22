import { Texture, TextureSource, type Renderer } from 'pixi.js';

// Sends loaded art to the GPU before anything draws it. Pixi uploads a texture the first time a
// frame draws it, so a run's first frame (every hero, mob and ground sheet at once) took 60 to
// 100 ms on a mid phone, and a chapter's new mobs or boss hitched again the first time they came
// on. Uploading behind the loading screen or the tap that starts the run moves that wait off
// the battlefield.
//
// Warmed art also opts out of Pixi's texture GC. ImageSource collects itself by default: a source
// no frame drew for a minute loses its GPU copy, so a boss or elite sheet warmed at the run's
// start uploaded again the moment it came on at wave 20, 35 or 50. Loaded art is freed by hand
// instead (freeChapterArt and freeLobbyArt unload what no run near it draws).

/** Every texture source under `root` (objects, arrays, maps and sets; walking stops at a texture). */
export function textureSources(root: unknown): Set<TextureSource> {
  const found = new Set<TextureSource>();
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v instanceof Texture) {
      if (!v.destroyed && v.source && !v.source.destroyed) found.add(v.source);
      return;
    }
    if (v instanceof TextureSource) {
      if (!v.destroyed) found.add(v);
      return;
    }
    const values = v instanceof Map || v instanceof Set ? v.values() : Array.isArray(v) ? v : Object.values(v);
    for (const x of values) walk(x);
  };
  walk(root);
  return found;
}

/** Uploads the texture sources under `root` that are not on the GPU yet, and keeps every one there until it is destroyed; returns how many it uploaded. */
export function warmTextures(renderer: Renderer, root: unknown): number {
  let n = 0;
  for (const source of textureSources(root)) {
    source.autoGarbageCollect = false;
    if (source._gpuData[renderer.uid]) continue;
    renderer.texture.initSource(source);
    n++;
  }
  return n;
}
