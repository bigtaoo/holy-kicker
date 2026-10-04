import { Application } from 'pixi.js';
import type { DragStick, Vec2 } from '../../game/dragStick';
import type { DeviceInfo } from '../../game/quality';
import { SafeStore, type KeyValueStore } from '../../meta/saveStore';
import { FAKE_ADS, NO_ADS, NO_PORTAL, type Ads, type AudioHost, type Platform, type Portal } from '../types';
import { webAudioHost } from './webAudio';

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
  private held = new Set<string>();
  readonly storage: KeyValueStore = new SafeStore(browserStorage());
  readonly portal: Portal = NO_PORTAL;
  readonly ads: Ads = new URLSearchParams(location.search).get('ads') === 'fake' ? FAKE_ADS : NO_ADS;
  readonly audio: AudioHost | null = webAudioHost();

  languages(): string[] {
    return [...(navigator.languages ?? [navigator.language])];
  }

  async probe(): Promise<DeviceInfo> {
    const nav = navigator as Navigator & { userAgentData?: { mobile: boolean }; deviceMemory?: number };
    const ua = nav.userAgent;
    // iPadOS reports a desktop Mac user agent; touch points give it away
    const mobile = nav.userAgentData?.mobile ?? (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1));
    return { mobile, cores: nav.hardwareConcurrency || 0, memoryGB: nav.deviceMemory || 0, gpu: '', modelLevel: 0 };
  }

  async createApp(msaa: boolean): Promise<Application> {
    const app = new Application();
    await app.init({
      background: '#141816',
      resizeTo: window,
      antialias: msaa,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      // WeChat has no WebGPU; use WebGL everywhere so both hosts behave the same.
      preference: 'webgl',
    });
    document.body.appendChild(app.canvas);
    window.addEventListener('keydown', (e) => {
      if (KEY_DIRS[e.code]) this.held.add(e.code);
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
}
