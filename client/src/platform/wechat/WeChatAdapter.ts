import type { Adapter, ICanvas, ICanvasRenderingContext2D } from 'pixi.js';

// Pixi v8 DOM adapter for the WeChat mini-game runtime (adapted from daydayup).
//
// Instead of weapp-adapter, which polyfills window/document/Image globally, this implements
// Pixi's own `Adapter` extension point. Set it with DOMAdapter.set(WeChatAdapter) BEFORE
// Application.init, and init with manageImports:false so Pixi's environment probe does not
// swap in the BrowserAdapter (which calls document.createElement and would crash here).
//
// Only what this runtime reaches is implemented: createCanvas (text rasterization),
// createImage (every PNG: with no createImageBitmap, Pixi's texture loader takes the
// createImage path), and the two context-constructor probes.

let ctx2DCtor: { prototype: ICanvasRenderingContext2D } | null = null;

function get2DContextConstructor(): { prototype: ICanvasRenderingContext2D } {
  if (!ctx2DCtor) {
    // Canvases created after the main one are offscreen and 2D-only, which is what we need.
    const c = wx.createCanvas();
    const ctx = c.getContext('2d') as { constructor: { prototype: ICanvasRenderingContext2D } };
    ctx2DCtor = ctx.constructor;
  }
  return ctx2DCtor;
}

function getWebGL1Constructor(): typeof WebGLRenderingContext {
  // Pixi only uses this for `gl instanceof <ctor>`: true means WebGL1, false WebGL2.
  if (typeof WebGLRenderingContext !== 'undefined') return WebGLRenderingContext;
  return class {} as unknown as typeof WebGLRenderingContext;
}

export const WeChatAdapter: Adapter = {
  createCanvas: (width?: number, height?: number) => {
    const c = wx.createCanvas();
    c.width = width ?? 0;
    c.height = height ?? 0;
    return c as unknown as ICanvas;
  },
  createImage: () => wx.createImage() as unknown as ReturnType<Adapter['createImage']>,
  getCanvasRenderingContext2D: () => get2DContextConstructor(),
  getWebGLRenderingContext: () => getWebGL1Constructor(),
  getNavigator: () => ({
    userAgent: 'wechat-minigame',
    gpu: null as unknown as GPU | null,
  }),
  getBaseUrl: () => '',
  getFontFaceSet: () => null,
  fetch: (): Promise<Response> =>
    // Loud on purpose: PNGs load through createImage, so anything arriving here is asking
    // for a remote asset, which should be a deliberate packaging decision.
    Promise.reject(new Error('WeChatAdapter.fetch is not implemented; assets load via createImage')),
  parseXML: (): Document => {
    throw new Error('WeChatAdapter.parseXML is not implemented');
  },
};
