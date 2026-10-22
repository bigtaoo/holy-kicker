// Pixi reaches its WebGL renderer and its browser extensions through dynamic imports, so a first
// visit fetched them only once index.js had run, then the extensions only once the renderer had:
// two more round trips before the first art request (about 1.5 s on a slow phone network). A
// <link rel="modulepreload"> per chunk fetches them beside index.js. The renderer is always WebGL
// (platform createApp), so the WebGPU chunks are left out. A browser without modulepreload
// ignores the links, and a failed preload costs nothing: the import fetches the chunk itself.
// Web hosts only: WeChat has no HTML, and the iOS app reads its files from the device.

const CHUNKS = ['WebGLRenderer', 'RenderTargetSystem', 'BufferResource', 'browserAll', 'webworkerAll'];

export function preloadRenderer() {
  let base = '/';
  return {
    name: 'hk-preload-renderer',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {}).filter((c) => c.type === 'chunk' && CHUNKS.includes(c.name));
        const missing = CHUNKS.filter((name) => !chunks.some((c) => c.name === name));
        // a Pixi upgrade that renames them should say so, not quietly lose the head start
        if (missing.length) throw new Error(`preloadRenderer: no chunk named ${missing.join(', ')}; update build/preloadRenderer.mjs`);
        return chunks.map((c) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `${base}${c.fileName}` }, injectTo: 'head' }));
      },
    },
  };
}
