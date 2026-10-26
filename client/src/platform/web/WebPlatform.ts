import type { Host } from '@hk/protocol';
import { Application } from 'pixi.js';
import { recordSize } from '../../dev/recorder';
import type { DragStick, Vec2 } from '../../game/dragStick';
import { MAX_RESOLUTION, type Battery, type DeviceInfo } from '../../game/quality';
import { SafeStore, type KeyValueStore } from '../../meta/saveStore';
import { themedStore } from '../../theme';
import { FAKE_ADS, NO_ADS, fakeNotifier, fakeStore, fakeUpdates, NO_AD_PRIVACY, NO_BANNER, NO_PORTAL, type AdPrivacy, type Ads, type AppUpdates, type Attention, type AudioHost, type Banner, type Insets, type Notifier, type Platform, type Portal, type Store, type TextAsk } from '../types';
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

/**
 * localStorage, or null where touching it throws (some sandboxed iframes); a theme other than the
 * monk's keeps its own keys there (src/theme.ts).
 */
export function browserStorage(): KeyValueStore | null {
  try {
    return themedStore(window.localStorage);
  } catch {
    return null;
  }
}

// Browser host: a window-sized canvas, pointer drags for the stick, WASD/arrows as well.
// No portal, no ads and no store; ?ads=fake stands in for an ad host and ?store=fake for the iOS
// ad-free card, ?notify=fake for its reminders and ?ota=fake (or fail) for its hot updates during development.
export class WebPlatform implements Platform {
  readonly host: Host = 'web';
  readonly sideways: boolean = true;
  private held = new Set<string>();
  private keyListeners: ((code: string, repeat: boolean) => void)[] = [];
  private seen: Attention = { focus: false, input: false };
  readonly storage: KeyValueStore = new SafeStore(browserStorage());
  readonly portal: Portal = NO_PORTAL;
  readonly ads: Ads = import.meta.env.DEV && new URLSearchParams(location.search).get('ads') === 'fake' ? FAKE_ADS : NO_ADS;
  readonly banner: Banner = this.ads === FAKE_ADS ? new BannerHost(FAKE_BANNER_FILL) : NO_BANNER;
  readonly adPrivacy: AdPrivacy = NO_AD_PRIVACY;
  readonly store: Store | null = import.meta.env.DEV && new URLSearchParams(location.search).get('store') === 'fake' ? fakeStore() : null;
  readonly notify?: Notifier = import.meta.env.DEV && new URLSearchParams(location.search).get('notify') === 'fake' ? fakeNotifier() : undefined;
  readonly updates?: AppUpdates = import.meta.env.DEV && /^(fake|fail)$/.test(new URLSearchParams(location.search).get('ota') ?? '') ? fakeUpdates(new URLSearchParams(location.search).get('ota') === 'fail') : undefined;
  readonly audio: AudioHost | null = webAudioHost();
  // a phone's browser; desktop Chrome has the call too but nothing to buzz
  readonly vibrate = typeof navigator.vibrate === 'function' && navigator.maxTouchPoints > 0 ? (strong: boolean) => void navigator.vibrate(strong ? 40 : 15) : undefined;

  askText(o: TextAsk): Promise<string | null> {
    return askTextDom(o);
  }

  device(): string {
    return navigator.userAgent.slice(0, 300);
  }

  /** A plain page does not know; the privacy region falls back to the time zone. */
  country(): string | null {
    return null;
  }

  openUrl(url: string): void {
    window.open(url, '_blank', 'noopener');
  }

  async copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // a portal's iframe may withhold clipboard-write: the old way still works from a tap
      return copyByCommand(text);
    }
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
    // once per time away: a portal that swaps the game's iframe out (another game picked on its
    // page) fires only pagehide in it, a closed tab fires both
    let away = false;
    const hide = () => {
      if (away) return;
      away = true;
      cb();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hide();
      else away = false;
    });
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', () => (away = false));
  }

  onBattery(cb: (b: Battery) => void): void {
    // Chromium only (Safari and Firefox have no Battery API), and a portal's iframe may block it
    type Manager = Battery & EventTarget;
    const nav = navigator as Navigator & { getBattery?: () => Promise<Manager> };
    nav.getBattery?.().then((m) => {
      const send = () => cb({ level: m.level, charging: m.charging });
      send();
      m.addEventListener('levelchange', send);
      m.addEventListener('chargingchange', send);
    }).catch(() => {});
  }

  async probe(): Promise<DeviceInfo> {
    const nav = navigator as Navigator & { userAgentData?: { mobile: boolean }; deviceMemory?: number };
    const ua = nav.userAgent;
    // iPadOS reports a desktop Mac user agent; touch points give it away
    const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
    const mobile = nav.userAgentData?.mobile ?? (/Android|iPhone|iPod|Mobile/i.test(ua) || ipad);
    const tablet = ipad || /Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua));
    const apple = ipad || /iPhone|iPod/.test(ua);
    return { mobile: mobile || tablet, tablet, apple, cores: nav.hardwareConcurrency || 0, memoryGB: nav.deviceMemory || 0, gpu: '', modelLevel: 0 };
  }

  /** The most pixels per logical pixel this host's canvas gets. */
  protected readonly maxResolution: number = MAX_RESOLUTION;

  /** Dev ?record draws a fixed canvas at density 1 (dev/recorder.ts). */
  private recording = false;

  density(): number {
    return this.recording ? 1 : Math.min(window.devicePixelRatio || 1, this.maxResolution);
  }

  async createApp(msaa: boolean): Promise<Application> {
    installTextCanvasFix();
    const app = new Application();
    // dev ?record: a fixed canvas at the video's size, scaled to the window by CSS (dev/recorder.ts)
    const record = recordSize(location.search);
    this.recording = !!record;
    await app.init({
      background: '#141816',
      ...(record ? { ...record, resolution: 1 } : { resizeTo: window, resolution: this.density() }),
      antialias: msaa,
      autoDensity: !record,
      // WeChat has no WebGPU; use WebGL everywhere so both hosts behave the same.
      preference: 'webgl',
    });
    if (record) app.canvas.style.cssText = 'display:block;max-width:100vw;max-height:100vh;margin:0 auto';
    document.body.appendChild(app.canvas);
    // ask for the keys from the start (a portal's iframe may still keep them until a click)
    window.focus();
    this.seen.focus = document.hasFocus();
    window.addEventListener('focus', () => (this.seen.focus = true));
    // a right-click or long press is a game input, never the browser's menu
    app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      this.seen.input = true;
      for (const cb of this.keyListeners) cb(e.code, e.repeat);
      if (e.code === 'Space') e.preventDefault();
      if (!KEY_DIRS[e.code]) return;
      this.held.add(e.code);
      // arrows (and Space) must not scroll a portal page around the game's iframe
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    return app;
  }

  bindStick(app: Application, stick: DragStick): void {
    const canvas = app.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      this.seen.input = true;
      // in a portal's iframe the keys go to the portal page until the game has the focus
      window.focus();
      stick.down(e.pointerId, e.clientX, e.clientY);
      // Keep receiving moves when the finger or mouse leaves the canvas mid-drag.
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => stick.move(e.pointerId, e.clientX, e.clientY));
    const end = (e: PointerEvent) => stick.up(e.pointerId);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  onKey(cb: (code: string, repeat: boolean) => void): void {
    this.keyListeners.push(cb);
  }

  keysReach(): boolean {
    return document.hasFocus();
  }

  attention(): Attention {
    // asked as the game goes to the background, when the page has just lost the focus
    if (document.hasFocus()) this.seen.focus = true;
    return { ...this.seen };
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

  async loadFont(path: string, family: string): Promise<string | null> {
    if (typeof FontFace === 'undefined') return null;
    // a face for every weight, so the labels' bold asks for this file and is not faked thicker
    const face = new FontFace(family, `url(${path})`, { weight: '100 900' });
    await face.load();
    document.fonts.add(face);
    return family;
  }

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

/** Copies through a hidden read-only text box (readonly keeps a phone's keyboard shut). */
function copyByCommand(text: string): boolean {
  const box = document.createElement('textarea');
  box.value = text;
  box.readOnly = true;
  box.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(box);
  try {
    box.select();
    box.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    box.remove();
  }
}
