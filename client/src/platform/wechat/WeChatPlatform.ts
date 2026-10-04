import { Application, DOMAdapter } from 'pixi.js';
import type { DragStick, Vec2 } from '../../game/dragStick';
import type { DeviceInfo } from '../../game/quality';
import { SafeStore, type KeyValueStore } from '../../meta/saveStore';
import { NO_ADS, NO_PORTAL, type Ads, type Platform, type Portal } from '../types';
import { WeChatAdapter } from './WeChatAdapter';
import { installWeChatEventBridge, type WeChatEventBridge } from './weChatDomEvents';

// WeChat mini-game host (adapted from daydayup's WeChatPlatform).
//  - The first wx.createCanvas() is the on-screen canvas; it is created before the adapter
//    is installed so the adapter's own offscreen probes never become the main canvas.
//  - No WebGPU, no resizeTo/autoDensity: size explicitly and set the resolution.
export class WeChatPlatform implements Platform {
  private bridge: WeChatEventBridge | null = null;
  // Ads and the wx.login cloud save come with the WeChat release (docs/design.md).
  readonly storage: KeyValueStore = new SafeStore({
    // getStorageSync answers '' for a key that was never written
    getItem: (key) => {
      const v = wx.getStorageSync(key);
      return typeof v === 'string' && v !== '' ? v : null;
    },
    setItem: (key, value) => wx.setStorageSync(key, value),
  });
  readonly portal: Portal = NO_PORTAL;
  readonly ads: Ads = NO_ADS;

  languages(): string[] {
    const lang = wx.getAppBaseInfo?.().language;
    return lang ? [lang] : [];
  }

  async probe(): Promise<DeviceInfo> {
    const info = wx.getDeviceInfo?.();
    const mobile = !info || !['windows', 'mac'].includes(info.platform);
    const bench = await new Promise<WxBenchmarkInfo | null>((resolve) => {
      if (!wx.getDeviceBenchmarkInfo) return resolve(null);
      // never hold up boot on a callback that does not come
      setTimeout(() => resolve(null), 500);
      wx.getDeviceBenchmarkInfo({ success: resolve, fail: () => resolve(null) });
    });
    return { mobile, cores: 0, memoryGB: (info?.memorySize ?? 0) / 1024, gpu: '', modelLevel: bench?.modelLevel ?? 0 };
  }

  async createApp(msaa: boolean): Promise<Application> {
    const wxCanvas = wx.createCanvas();
    const info = wx.getWindowInfo();

    this.bridge = installWeChatEventBridge(wxCanvas);
    const c = wxCanvas as unknown as {
      getBoundingClientRect?: () => DOMRect;
      style?: Record<string, unknown>;
    };
    c.getBoundingClientRect ??= () =>
      ({
        x: 0, y: 0, left: 0, top: 0,
        width: info.windowWidth, height: info.windowHeight,
        right: info.windowWidth, bottom: info.windowHeight,
      }) as DOMRect;
    c.style ??= {};

    DOMAdapter.set(WeChatAdapter);

    const app = new Application();
    await app.init({
      canvas: wxCanvas as unknown as HTMLCanvasElement,
      width: info.windowWidth,
      height: info.windowHeight,
      background: '#141816',
      antialias: msaa,
      resolution: Math.min(info.pixelRatio || 1, 2),
      autoDensity: false,
      preference: 'webgl',
      manageImports: false,
    });
    return app;
  }

  bindStick(_app: Application, stick: DragStick): void {
    // The first active touch also drives Pixi's synthetic mouse pointer (for UI buttons).
    let mouseTouch: number | null = null;
    wx.onTouchStart((e) => {
      for (const t of e.changedTouches) {
        stick.down(t.identifier, t.clientX, t.clientY);
        if (mouseTouch === null) {
          mouseTouch = t.identifier;
          this.bridge?.dispatch('mousedown', t.clientX, t.clientY);
        }
      }
    });
    wx.onTouchMove((e) => {
      for (const t of e.changedTouches) {
        stick.move(t.identifier, t.clientX, t.clientY);
        if (t.identifier === mouseTouch) this.bridge?.dispatch('mousemove', t.clientX, t.clientY);
      }
    });
    const end = (e: WxTouchEvent) => {
      for (const t of e.changedTouches) {
        stick.up(t.identifier);
        if (t.identifier === mouseTouch) {
          this.bridge?.dispatch('mouseup', t.clientX, t.clientY);
          mouseTouch = null;
        }
      }
    };
    wx.onTouchEnd(end);
    wx.onTouchCancel(end);
  }

  readKeys(): Vec2 {
    return { x: 0, y: 0 };
  }

  loadPack(name: string): Promise<void> {
    // the subpackage is declared in game.json by the build (vite.wechat.config.js)
    return new Promise((resolve, reject) => {
      wx.loadSubpackage({ name, success: () => resolve(), fail: (res) => reject(new Error(`loadSubpackage ${name}: ${res?.errMsg ?? 'failed'}`)) });
    });
  }

  async readText(path: string): Promise<string> {
    // there is no fetch; package files are read straight from the file system
    return wx.getFileSystemManager().readFileSync(path, 'utf8');
  }
}
