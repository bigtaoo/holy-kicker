import { Application } from 'pixi.js';
import type { DragStick, Vec2 } from '../../game/dragStick';
import type { Platform } from '../types';

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

// Browser host: a window-sized canvas, pointer drags for the stick, WASD/arrows as well.
export class WebPlatform implements Platform {
  private held = new Set<string>();

  async createApp(): Promise<Application> {
    const app = new Application();
    await app.init({
      background: '#141816',
      resizeTo: window,
      antialias: true,
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

  async readText(path: string): Promise<string> {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.text();
  }
}
