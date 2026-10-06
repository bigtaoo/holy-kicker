import type { Host } from '@hk/protocol';
import { Application } from 'pixi.js';
import type { DragStick, Vec2 } from '../../game/dragStick';
import type { DeviceInfo } from '../../game/quality';
import { SafeStore, type KeyValueStore } from '../../meta/saveStore';
import { FAKE_ADS, NO_ADS, NO_BANNER, NO_PORTAL, type Ads, type AudioHost, type Banner, type Insets, type Platform, type Portal, type TextAsk } from '../types';
import { BannerHost, FAKE_BANNER_FILL } from './banner';
import { askTextDom } from './textAsk';
import { webAudioHost } from './webAudio';
import { installTextCanvasFix } from './textCanvas';

const KEY_DIRS: Record<string, Vec2> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/** localStorage, or null where touching it throws (some sandboxed iframes). */
export function browserStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Browser host: a window-sized canvas, pointer drags for the stick, WASD/arrows as well.
// No portal and no ads; ?ads=fake stands in for an ad host during development.
export class WebPlatform implements Platform {
  readonly host: Host = 'web';
  private held = new Set<string>();
  readonly storage: KeyValueStore = new SafeStore(browserStorage());
  readonly portal: Portal = NO_PORTAL;
  readonly ads: Ads = new URLSearchParams(location.search).get('ads') === 'fake' ? FAKE_ADS : NO_ADS;
  readonly banner: Banner = this.ads === FAKE_ADS ? new BannerHost(FAKE_BANNER_FILL) : NO_BANNER;
  readonly audio: AudioHost | null = webAudioHost();

  askText(o: TextAsk): Promise<string | null> {
    return askTextDom(o);
  }

  device(): string {
    return navigator.userAgent.slice(0, 300);
  }

  languages(): string[] {
    return [...(navigator.languages ?? [navigator.language])];
  }

  safeInsets(): Insets {
    // env() is only readable through a laid-out element; 0 outside notched, full-bleed pages
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;'
      + 'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(probe);
    const s = getComputedStyle(probe);
    const insets = { top: parseFloat(s.paddingTop) || 0, bottom: parseFloat(s.paddingBottom) || 0 };
    probe.remove();
    return insets;
  }

  onHide(cb: () => void): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cb();
    });
  }

  async probe(): Promise<DeviceInfo> {
    const nav = navigator as Navigator & { userAgentData?: { mobile: boolean }; deviceMemory?: number };
    const ua = nav.userAgent;
    // iPadOS reports a desktop Mac user agent; touch points give it away
    const mobile = nav.userAgentData?.mobile ?? (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1));
    return { mobile, cores: nav.hardwareConcurrency || 0, memoryGB: nav.deviceMemory || 0, gpu: '', modelLevel: 0 };
  }

  async createApp(msaa: boolean): Promise<Application> {
    installTextCanvasFix();
    const app = new Application();
    // dev ?record: a fixed phone-sized canvas, scaled to the window by CSS (dev/recorder.ts)
    const record = new URLSearchParams(location.search).has('record');
    await app.init({
      background: '#141816',
      ...(record ? { width: 1080, height: 1920, resolution: 1 } : { resizeTo: window, resolution: Math.min(window.devicePixelRatio || 1, 2) }),
      antialias: msaa,
      autoDensity: !record,
      // WeChat has no WebGPU; use WebGL everywhere so both hosts behave the same.
      preference: 'webgl',
    });
    if (record) app.canvas.style.cssText = 'display:block;height:100vh;width:auto;margin:0 auto';
    document.body.appendChild(app.canvas);
    // a right-click or long press is a game input, never the browser's menu
    app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (!KEY_DIRS[e.code]) return;
      this.held.add(e.code);
      // arrows must not scroll a portal page around the game's iframe
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    return app;
  }

  bindStick(app: Application, stick: DragStick): void {
    const canvas = app.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      stick.down(e.pointerId, e.clientX, e.clientY);
      // Keep receiving moves when the finger or mouse leaves the canvas mid-drag.
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => stick.move(e.pointerId, e.clientX, e.clientY));
    const end = (e: PointerEvent) => stick.up(e.pointerId);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  readKeys(): Vec2 {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      x += KEY_DIRS[code].x;
      y += KEY_DIRS[code].y;
    }
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  async loadPack(_name: string): Promise<void> {}

  async readText(path: string): Promise<string> {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.text();
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.arrayBuffer();
  }
}
