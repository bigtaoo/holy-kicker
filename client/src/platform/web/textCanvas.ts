import { BrowserAdapter, DOMAdapter, type Adapter } from 'pixi.js';

// Pixi draws every Text into a pooled 2D canvas and uploads it as a texture. On a
// GPU-accelerated 2D canvas the browser can hand that upload a stale, blank snapshot, so a
// healthy Text shows nothing: a level-up card with an icon and no words. Asking for
// `willReadFrequently` keeps those canvases in software, which removes the race (the fix
// proposed upstream in pixijs/pixijs#12109; drop this once a release carries it).
// The game's own canvas is WebGL and is not touched.

export function textCanvasAdapter(base: Adapter = BrowserAdapter): Adapter {
  return {
    ...base,
    createCanvas(width, height) {
      const canvas = base.createCanvas(width, height);
      const get = canvas.getContext.bind(canvas) as (type: string, options?: object) => unknown;
      (canvas as { getContext: unknown }).getContext = (type: string, options?: object) =>
        get(type, type === '2d' ? { willReadFrequently: true, ...options } : options);
      return canvas;
    },
  };
}

/** Installs the adapter; call before the Application is created. */
export function installTextCanvasFix(): void {
  DOMAdapter.set(textCanvasAdapter());
}
