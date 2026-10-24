/// <reference types="node" />
/**
 * Pixi without a GPU or a DOM, for tests that build the shell's screens under vitest (node):
 * a fake canvas whose 2D context measures text by a fixed advance per character, `Assets` loads
 * that read the real PNG's size from disk and give an empty texture of that size, and a renderer
 * that bakes into blank render textures and draws nothing. Assert on the tree, never on pixels.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Application, Assets, Container, DOMAdapter, Rectangle, RenderTexture, Texture, TextureSource, Ticker,
  type GenerateTextureOptions, type Renderer,
} from 'pixi.js';
import { THEME } from '../theme';
import corgiFiles from '../../themes/corgi.json';

const CLIENT = fileURLToPath(new URL('../..', import.meta.url));
const REPO = resolve(CLIENT, '..');

/** A file the game reads by its public path, in the theme the test runs (null: the corgi has none yet). */
export function publicFile(path: string): string | null {
  const clean = path.replace(/^\.?\//, '').split('?')[0];
  if (THEME !== 'corgi') return resolve(CLIENT, 'public', clean);
  const mapped = (corgiFiles as Record<string, string | null>)[clean];
  return mapped ? resolve(REPO, mapped) : null;
}

export function readPublicText(path: string): string {
  const file = publicFile(path);
  if (!file) throw new Error(`no ${THEME} file for ${path}`);
  return readFileSync(file, 'utf8');
}

/** Width and height from a PNG's header; a fixed square for anything else. */
function picSize(path: string): [number, number] {
  const file = publicFile(path);
  if (!file || !path.endsWith('.png')) return [256, 256];
  const head = readFileSync(file).subarray(0, 24);
  return [head.readUInt32BE(16), head.readUInt32BE(20)];
}

function blank(width: number, height: number, label = 'headless'): Texture {
  return new Texture({ source: new TextureSource({ width, height, resolution: 1, label }) });
}

/** Text widths by a fixed advance: about half an em per character, the font size read from `font`. */
class FakeContext2D {
  font = '10px sans-serif';
  letterSpacing = '0px';
  textBaseline = 'alphabetic';
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  canvas: FakeCanvas;
  constructor(canvas: FakeCanvas) {
    this.canvas = canvas;
  }
  private size(): number {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return m ? Number(m[1]) : 10;
  }
  measureText(text: string) {
    const size = this.size();
    const width = [...text].length * size * 0.55;
    return {
      width,
      actualBoundingBoxAscent: size * 0.8,
      actualBoundingBoxDescent: size * 0.2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
      fontBoundingBoxAscent: size * 0.8,
      fontBoundingBoxDescent: size * 0.2,
    };
  }
  getImageData(_x: number, _y: number, w: number, h: number) {
    return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h };
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
  createPattern() {
    return {};
  }
}
for (const name of [
  'fillText', 'strokeText', 'fillRect', 'clearRect', 'strokeRect', 'save', 'restore', 'scale', 'translate', 'rotate',
  'setTransform', 'resetTransform', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'rect', 'fill', 'stroke',
  'drawImage', 'putImageData', 'clip', 'quadraticCurveTo', 'bezierCurveTo',
]) {
  (FakeContext2D.prototype as unknown as Record<string, () => void>)[name] = () => {};
}

class FakeCanvas {
  width: number;
  height: number;
  style: Record<string, string> = {};
  private ctx: FakeContext2D | null = null;
  constructor(width = 1, height = 1) {
    this.width = width;
    this.height = height;
  }
  getContext(kind: string) {
    if (kind !== '2d') return null;
    return (this.ctx ??= new FakeContext2D(this));
  }
  addEventListener() {}
  removeEventListener() {}
  toDataURL() {
    return 'data:,';
  }
}

/** The fake renderer: generateTexture gives a blank render texture of the frame's size, render draws nothing. */
export function fakeRenderer(): Renderer {
  const runner = () => ({ add() {}, remove() {}, emit() {} });
  const r = {
    uid: 1,
    name: 'headless',
    type: 0,
    resolution: 1,
    width: 1080,
    height: 1920,
    screen: new Rectangle(0, 0, 1080, 1920),
    canvas: new FakeCanvas(1080, 1920),
    runners: { contextChange: runner(), resolutionChange: runner() },
    texture: { initSource() {}, managedTextures: [] as unknown[] },
    gl: null,
    background: { color: 0 },
    generateTexture(opts: GenerateTextureOptions | Container) {
      const o = opts instanceof Container ? { target: opts } : opts;
      const f = o.frame ?? o.target.getLocalBounds().rectangle;
      return RenderTexture.create({ width: Math.max(1, Math.ceil(f.width)), height: Math.max(1, Math.ceil(f.height)) });
    },
    render() {},
    resize() {},
    destroy() {},
  };
  return new Proxy(r, {
    get(target, key) {
      if (key in target || typeof key === 'symbol' || key === 'then') return (target as Record<string | symbol, unknown>)[key];
      throw new Error(`headless renderer has no ${String(key)}`);
    },
  }) as unknown as Renderer;
}

/** An Application with a stage, a manual ticker and the fake renderer; drive it with `tick`. */
export function fakeApp(): Application {
  const ticker = new Ticker();
  ticker.autoStart = false;
  ticker.stop();
  const app = Object.create(Application.prototype) as Application;
  Object.assign(app, { stage: new Container(), ticker, renderer: fakeRenderer() });
  Object.defineProperty(app, 'screen', { get: () => app.renderer.screen });
  Object.defineProperty(app, 'canvas', { get: () => app.renderer.canvas });
  return app;
}

let installed = false;

/** Points Pixi at the fake canvas and `Assets` at the files on disk; safe to call more than once. */
export function installHeadless(): void {
  if (installed) return;
  installed = true;
  const base = DOMAdapter.get();
  DOMAdapter.set({
    ...base,
    createCanvas: (w?: number, h?: number) => new FakeCanvas(w, h) as never,
    getCanvasRenderingContext2D: () => FakeContext2D as never,
    getWebGLRenderingContext: () => class {} as never,
    getNavigator: () => ({ userAgent: 'node', gpu: null }),
    getBaseUrl: () => 'http://localhost/',
    getFontFaceSet: () => null,
  });
  // OffscreenCanvas would win over the adapter in text measuring; node has none, keep it that way
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  const cache = new Map<string, Texture>();
  const load = async (what: unknown): Promise<unknown> => {
    if (Array.isArray(what)) return Object.fromEntries(await Promise.all(what.map(async (u) => [u, await load(u)])));
    const url = typeof what === 'string' ? what : (what as { src: string }).src;
    let tex = cache.get(url);
    if (!tex) {
      const [w, h] = picSize(url);
      cache.set(url, (tex = blank(w, h, url)));
    }
    return tex;
  };
  Object.assign(Assets, {
    init: async () => {},
    load,
    unload: async (url: string | string[]) => {
      for (const u of [url].flat()) cache.delete(u);
    },
  });
}
