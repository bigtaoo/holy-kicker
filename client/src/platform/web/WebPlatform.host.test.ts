import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { DragStick } from '../../game/dragStick';
import { browserStubs, fakeBrowser, type FakeBrowser } from '../../testkit/fakeBrowser';
import { WebPlatform } from './WebPlatform';

// The browser host's other calls into the page: the clipboard, links, languages, insets, the
// device probe, battery, fonts, files and the drag stick, against a fake page and navigator.

let b: FakeBrowser;
const nav = (o: Record<string, unknown> = {}) => vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', language: 'de-DE', maxTouchPoints: 0, hardwareConcurrency: 8, ...o });

function platform(o: Record<string, unknown> = {}) {
  b = fakeBrowser();
  for (const [k, v] of Object.entries(browserStubs(b))) vi.stubGlobal(k, v);
  nav(o);
  return new WebPlatform();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WebPlatform host calls', () => {
  it('copies through the clipboard, and through a hidden box where the iframe withholds it', async () => {
    const written: string[] = [];
    let p = platform({ clipboard: { writeText: async (t: string) => void written.push(t) } });
    expect(await p.copyText('HK-1234')).toBe(true);
    expect(written).toEqual(['HK-1234']);
    p = platform({ clipboard: { writeText: async () => { throw new Error('denied'); } } });
    expect(await p.copyText('HK-1234')).toBe(true);
    expect(b.document.commands).toEqual(['copy']);
    // the box never stays on the page
    expect(b.document.body.children).toHaveLength(0);
    b.document.commandWorks = false;
    expect(await p.copyText('x')).toBe(false);
  });

  it('opens links in a new tab and names the device by its user agent', () => {
    const p = platform({ languages: ['de-DE', 'en'] });
    p.openUrl('https://hk.gamestao.com/privacy');
    expect(b.opened).toEqual(['https://hk.gamestao.com/privacy']);
    expect(p.device()).toBe('Mozilla/5.0 (X11; Linux x86_64)');
    expect(p.languages()).toEqual(['de-DE', 'en']);
    expect(platform().languages()).toEqual(['de-DE']);
    expect(p.country()).toBeNull();
  });

  it('reads the safe-area insets off a probe element and takes it away again', () => {
    const p = platform();
    vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '47px', paddingBottom: '' }));
    expect(p.safeInsets()).toEqual({ top: 47, bottom: 0 });
    expect(b.document.body.children).toHaveLength(0);
  });

  it('tells phones, iPads that pose as Macs and desktops apart', async () => {
    expect(await platform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)', maxTouchPoints: 5 }).probe())
      .toMatchObject({ mobile: true, tablet: false, apple: true });
    expect(await platform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }).probe())
      .toMatchObject({ mobile: true, tablet: true, apple: true });
    expect(await platform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710)' }).probe()).toMatchObject({ mobile: true, tablet: true, apple: false });
    expect(await platform({ deviceMemory: 8 }).probe()).toMatchObject({ mobile: false, tablet: false, cores: 8, memoryGB: 8 });
  });

  it('buzzes only on a touch device', () => {
    const buzz = vi.fn();
    expect(platform({ vibrate: buzz }).vibrate).toBeUndefined();
    platform({ vibrate: buzz, maxTouchPoints: 5 }).vibrate!(true);
    expect(buzz).toHaveBeenCalledWith(40);
  });

  it('passes the battery on at once and on every change, and stays quiet without the API', async () => {
    const m = Object.assign(new EventTarget(), { level: 0.5, charging: false });
    const p = platform({ getBattery: async () => m });
    const seen = vi.fn();
    p.onBattery(seen);
    await vi.runAllTimersAsync();
    m.level = 0.4;
    m.dispatchEvent(new Event('levelchange'));
    expect(seen.mock.calls).toEqual([[{ level: 0.5, charging: false }], [{ level: 0.4, charging: false }]]);
    platform({ getBattery: async () => { throw new Error('blocked'); } }).onBattery(seen);
    await vi.runAllTimersAsync();
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('loads a font face for every weight, and none where FontFace is missing', async () => {
    const p = platform();
    expect(await p.loadFont('fonts/lilita.woff2', 'Lilita One')).toBeNull();
    const made: unknown[][] = [];
    vi.stubGlobal('FontFace', class { constructor(...a: unknown[]) { made.push(a); } async load() {} });
    expect(await p.loadFont('fonts/lilita.woff2', 'Lilita One')).toBe('Lilita One');
    expect(made).toEqual([['Lilita One', 'url(fonts/lilita.woff2)', { weight: '100 900' }]]);
    expect(b.document.fonts.added).toHaveLength(1);
  });

  it('reads files over fetch and fails loudly on an HTTP error', async () => {
    const p = platform();
    vi.stubGlobal('fetch', async (path: string) => (path === 'ok.json'
      ? { ok: true, status: 200, text: async () => '{}', arrayBuffer: async () => new ArrayBuffer(3) }
      : { ok: false, status: 404 }));
    expect(await p.readText('ok.json')).toBe('{}');
    expect((await p.readBinary('ok.json')).byteLength).toBe(3);
    await expect(p.readText('gone.json')).rejects.toThrow('gone.json: HTTP 404');
    await expect(p.readBinary('gone.json')).rejects.toThrow('HTTP 404');
  });

  it('drives the stick from pointer drags, captured to the canvas, and counts them as input', () => {
    const p = platform();
    const canvas = b.document.createElement('canvas');
    const stick = new DragStick();
    const spy = { down: vi.spyOn(stick, 'down'), move: vi.spyOn(stick, 'move'), up: vi.spyOn(stick, 'up') };
    p.bindStick({ canvas } as unknown as Application, stick);
    expect(p.attention()).toEqual({ focus: true, input: false });
    canvas.dispatch('pointerdown', { pointerId: 3, clientX: 10, clientY: 20 } as never);
    canvas.dispatch('pointermove', { pointerId: 3, clientX: 30, clientY: 20 } as never);
    canvas.dispatch('pointercancel', { pointerId: 3 } as never);
    expect([spy.down.mock.calls, spy.move.mock.calls, spy.up.mock.calls]).toEqual([[[3, 10, 20]], [[3, 30, 20]], [[3]]]);
    expect(canvas.captured).toEqual([3]);
    expect(p.attention().input).toBe(true);
    expect(p.readKeys()).toEqual({ x: 0, y: 0 });
  });
});
