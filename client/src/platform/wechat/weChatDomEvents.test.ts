import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeWxRuntime } from '../../testkit/fakeWxRuntime';
import { WeChatAdapter } from './WeChatAdapter';
import { installWeChatEventBridge } from './weChatDomEvents';

// The two pieces that let Pixi run in the mini-game: the DOM adapter over `wx`, and the
// listener registry that feeds touches to Pixi's EventSystem as a mouse.

afterEach(() => vi.unstubAllGlobals());

class Target {
  added: string[] = [];
  removed: string[] = [];
  addEventListener(type: string) {
    this.added.push(type);
  }
  removeEventListener(type: string) {
    this.removed.push(type);
  }
}

describe('installWeChatEventBridge', () => {
  it('hands synthetic mouse events to the listeners Pixi put on the canvas', () => {
    const canvas: Record<string, (t: string, fn: (e: unknown) => void) => void> = {};
    const bridge = installWeChatEventBridge(canvas, new Target(), new Target());
    const seen: unknown[] = [];
    const fn = (e: unknown) => seen.push(e);
    canvas.addEventListener('mousedown', fn);
    bridge.dispatch('mousedown', 10, 20);
    bridge.dispatch('mousemove', 1, 1); // nobody listens yet
    expect(seen).toEqual([expect.objectContaining({ type: 'mousedown', target: canvas, clientX: 10, clientY: 20, buttons: 1 })]);
    canvas.removeEventListener('mousedown', fn);
    bridge.dispatch('mousedown', 0, 0);
    expect(seen).toHaveLength(1);
  });

  it('taps mouseup on the global and mousemove on the document, and still passes them on', () => {
    const global = new Target();
    const doc = new Target();
    const bridge = installWeChatEventBridge({}, global, doc);
    const up = vi.fn();
    const move = vi.fn();
    (global as unknown as { addEventListener: (t: string, f: unknown) => void }).addEventListener('mouseup', up);
    (global as unknown as { addEventListener: (t: string, f: unknown) => void }).addEventListener('keydown', () => {});
    (doc as unknown as { addEventListener: (t: string, f: unknown) => void }).addEventListener('mousemove', move);
    expect([global.added, doc.added]).toEqual([['mouseup', 'keydown'], ['mousemove']]);
    bridge.dispatch('mouseup', 5, 6);
    bridge.dispatch('mousemove', 7, 8);
    expect(up.mock.calls[0][0]).toMatchObject({ clientX: 5, buttons: 0 });
    expect(move.mock.calls[0][0]).toMatchObject({ clientX: 7, buttons: 1 });
    (global as unknown as { removeEventListener: (t: string, f: unknown) => void }).removeEventListener('mouseup', up);
    bridge.dispatch('mouseup', 0, 0);
    expect(up).toHaveBeenCalledTimes(1);
    expect(global.removed).toEqual(['mouseup']);
  });

  it('carries on without a global or document to tap (the mini-game has no document)', () => {
    const frozen = Object.freeze({ addEventListener() {} });
    expect(() => installWeChatEventBridge({}, undefined, null)).not.toThrow();
    expect(() => installWeChatEventBridge({}, frozen, {})).not.toThrow();
  });
});

describe('WeChatAdapter', () => {
  it('makes canvases and images through wx and finds the 2D context constructor once', () => {
    const rt = fakeWxRuntime();
    vi.stubGlobal('wx', rt.wx);
    const c = WeChatAdapter.createCanvas(64, 32) as unknown as { width: number; height: number };
    expect([c.width, c.height]).toEqual([64, 32]);
    const d = WeChatAdapter.createCanvas() as unknown as { width: number };
    expect(d.width).toBe(0);
    expect(WeChatAdapter.createImage()).toEqual({ src: '' });
    const ctor = WeChatAdapter.getCanvasRenderingContext2D();
    expect(ctor).toBe(rt.ctx2d.constructor);
    const made = rt.canvases.length;
    expect(WeChatAdapter.getCanvasRenderingContext2D()).toBe(ctor);
    expect(rt.canvases).toHaveLength(made);
  });

  it('answers the probes Pixi makes and refuses fetch and XML loudly', async () => {
    expect(typeof WeChatAdapter.getWebGLRenderingContext()).toBe('function');
    vi.stubGlobal('WebGLRenderingContext', class GL1 {});
    expect(WeChatAdapter.getWebGLRenderingContext().name).toBe('GL1');
    expect(WeChatAdapter.getNavigator().userAgent).toBe('wechat-minigame');
    expect([WeChatAdapter.getBaseUrl(), WeChatAdapter.getFontFaceSet()]).toEqual(['', null]);
    await expect(WeChatAdapter.fetch('x.png')).rejects.toThrow('assets load via createImage');
    expect(() => WeChatAdapter.parseXML('<a/>')).toThrow('not implemented');
  });
});
