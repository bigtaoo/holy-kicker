import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { DragStick } from '../../game/dragStick';
import { SAVE_KEY, SaveStore } from '../../meta/saveStore';
import { loadSettings, updateSettings } from '../../meta/settings';
import { fakeWxRuntime } from '../../testkit/fakeWxRuntime';
import { NO_ADS } from '../types';
import { WeChatPlatform } from './WeChatPlatform';

// The WeChat host against a fake `wx` (testkit/fakeWxRuntime.ts): its storage, which throws when
// the 10 MB store is full; going to the background and back; the text dialog; the device calls.

let rt: ReturnType<typeof fakeWxRuntime>;

/** A launch of the WeChat host over `disk` (the launch before's, when passed). */
function launch(o: Parameters<typeof fakeWxRuntime>[0] = {}, disk?: Map<string, unknown>) {
  rt = fakeWxRuntime(o);
  if (disk) for (const [k, v] of disk) rt.disk.set(k, v);
  vi.stubGlobal('wx', rt.wx);
  return new WeChatPlatform();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WeChatPlatform storage', () => {
  it('keeps the save in wx storage for the next launch', () => {
    const store = new SaveStore(launch().storage);
    store.save({ ...store.load(), copper: 300 });
    expect(JSON.parse(rt.disk.get(SAVE_KEY) as string).copper).toBe(300);
    expect(new SaveStore(launch({}, rt.disk).storage).load().copper).toBe(300);
  });

  it('reads a key never written, or written as something other than text, as missing', () => {
    const p = launch();
    rt.disk.set('hk.odd', { not: 'text' });
    expect([p.storage.getItem('hk.none'), p.storage.getItem('hk.odd')]).toEqual([null, null]);
  });

  it('plays on from memory when setStorageSync throws, and writes again once it works', () => {
    const p = launch();
    const store = new SaveStore(p.storage);
    store.save({ ...store.load(), copper: 1 });
    rt.failStorage('set');
    expect(() => store.save({ ...store.load(), copper: 2 })).not.toThrow();
    expect(store.load().copper).toBe(2);
    expect(JSON.parse(rt.disk.get(SAVE_KEY) as string).copper).toBe(1);
    rt.failStorage(null);
    store.save({ ...store.load(), copper: 3 });
    expect(new SaveStore(launch({}, rt.disk).storage).load().copper).toBe(3);
  });

  it('starts a fresh save rather than crash when the store cannot be read at all', () => {
    rt = fakeWxRuntime();
    rt.failStorage('both');
    vi.stubGlobal('wx', rt.wx);
    const p = new WeChatPlatform();
    const store = new SaveStore(p.storage);
    expect(() => store.load()).not.toThrow();
    store.save({ ...store.load(), copper: 9 });
    expect(store.load().copper).toBe(9);
    updateSettings(p.storage, { dataSharing: 'no' });
    expect(loadSettings(p.storage).dataSharing).toBe('no');
  });

  it('writes what the hide callback saves while WeChat goes to the background', () => {
    const p = launch();
    const store = new SaveStore(p.storage);
    p.onHide(() => store.save({ ...store.load(), copper: 42 }));
    rt.hide();
    expect(JSON.parse(rt.disk.get(SAVE_KEY) as string).copper).toBe(42);
  });
});

describe('WeChatPlatform sound', () => {
  it('pauses the sound in the background and for an incoming call, and resumes it after', () => {
    const p = launch();
    const focus = vi.fn();
    p.audio!.onFocus(focus);
    rt.hide();
    rt.show();
    rt.fire('interruptBegin');
    rt.fire('interruptEnd');
    expect(focus.mock.calls).toEqual([[false], [true], [false], [true]]);
    expect(p.audio!.context()).toEqual({ kind: 'wx-web-audio' });
    // mixes with the player's own music instead of stopping it
    expect(rt.audioOptions).toEqual([{ mixWithOther: true, obeyMuteSwitch: true }]);
    const gesture = vi.fn();
    p.audio!.onGesture(gesture);
    rt.touch('touchend', { identifier: 0, clientX: 1, clientY: 1 });
    expect(gesture).toHaveBeenCalled();
  });

  it('streams music through two inner audio contexts, set to obey the mute switch', () => {
    const decks = launch().audio!.musicDecks!({} as AudioContext);
    expect(decks).toHaveLength(2);
    expect(rt.decks.map((d) => [d.loop, d.obeyMuteSwitch, d.volume])).toEqual([[false, true, 0], [false, true, 0]]);
  });

  it('has no sound on a base library without Web Audio, and no ads without unit ids', () => {
    const p = launch({ audio: false });
    expect(p.audio).toBeNull();
    expect(p.ads).toBe(NO_ADS);
  });
});

describe('WeChatPlatform dialog and device', () => {
  it('asks for text in WeChat\'s own dialog and answers it trimmed to the limit', async () => {
    const p = launch();
    const ask = { title: 'Name', prompt: 'unused', placeholder: 'Monk', send: 'OK', cancel: 'No', max: 4 };
    const sent = p.askText(ask);
    expect(rt.modals[0]).toMatchObject({ title: 'Name', editable: true, placeholderText: 'Monk', confirmText: 'OK', cancelText: 'No' });
    rt.modals[0].success!({ confirm: true, cancel: false, content: '  Dao Ming ' });
    expect(await sent).toBe('Dao ');
    const cancelled = p.askText(ask);
    rt.modals[1].success!({ confirm: false, cancel: true });
    expect(await cancelled).toBeNull();
    const failed = p.askText(ask);
    rt.modals[2].fail!();
    expect(await failed).toBeNull();
    const empty = p.askText(ask);
    rt.modals[3].success!({ confirm: true, cancel: false });
    expect(await empty).toBe('');
    expect(await launch({ modal: false }).askText(ask)).toBeNull();
  });

  it('keeps the top inset below the menu capsule, and falls back to the safe area', () => {
    const p = launch();
    expect(p.safeInsets()).toEqual({ top: 90, bottom: 34 });
    rt.wx.getMenuButtonBoundingClientRect = () => { throw new Error('not supported'); };
    expect(p.safeInsets()).toEqual({ top: 47, bottom: 34 });
    rt.wx.getWindowInfo = () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2 }) as never;
    rt.wx.getMenuButtonBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(p.safeInsets()).toEqual({ top: 0, bottom: 0 });
  });

  it('names the device, its language and level, and never waits long for the benchmark', async () => {
    const p = launch();
    expect(p.device()).toBe('Xiaomi · 23078RKD5C · Android 14 · base 3.4.1');
    expect(p.languages()).toEqual(['zh_CN']);
    expect([p.country(), p.readKeys()]).toEqual([null, { x: 0, y: 0 }]);
    expect(await p.probe()).toEqual({ mobile: true, tablet: false, cores: 0, memoryGB: 8, gpu: '', modelLevel: 2 });
    rt.wx.getDeviceBenchmarkInfo = () => {};
    rt.wx.getDeviceInfo = () => ({ brand: 'Apple', model: 'iPad Pro', system: 'iPadOS 18', platform: 'ios', memorySize: 0 });
    const slow = p.probe();
    await vi.advanceTimersByTimeAsync(500);
    expect(await slow).toMatchObject({ tablet: true, modelLevel: 0 });
    rt.wx.getDeviceInfo = () => ({ brand: '', model: 'PC', system: 'Windows 11', platform: 'windows', memorySize: 16384 });
    rt.wx.getDeviceBenchmarkInfo = undefined as never;
    expect(await p.probe()).toMatchObject({ mobile: false, memoryGB: 16 });
  });

  it('asks for the battery once a minute, buzzes, and passes memory warnings and script errors on', () => {
    const p = launch();
    const battery = vi.fn();
    p.onBattery(battery);
    vi.advanceTimersByTime(60_000);
    expect(battery.mock.calls).toEqual([[{ level: 0.64, charging: true }], [{ level: 0.64, charging: true }]]);
    p.vibrate(true);
    p.vibrate(false);
    expect(rt.vibrations).toEqual(['heavy', 'light']);
    const memory = vi.fn();
    p.onMemoryWarning(memory);
    rt.fire('memory', { level: 10 });
    rt.fire('memory');
    expect(memory.mock.calls).toEqual([[10], [0]]);
    const errors = vi.fn();
    p.onScriptError(errors);
    rt.fire('error', { message: 'boom', stack: 'at x' });
    const err = new Error('later');
    rt.fire('rejection', { reason: err });
    rt.fire('rejection', { reason: 'text' });
    expect(errors.mock.calls).toEqual([['boom', 'at x'], [err, err.stack], ['text', undefined]]);
  });

  it('loads subpackages and fonts, and reads package files from the file system', async () => {
    const p = launch();
    const ok = p.loadPack('audio');
    rt.packs[0].success!();
    await expect(ok).resolves.toBeUndefined();
    const bad = p.loadPack('art');
    rt.packs[1].fail!({ errMsg: 'loadSubpackage:fail network' });
    await expect(bad).rejects.toThrow('loadSubpackage art: loadSubpackage:fail network');
    const unnamed = p.loadPack('x');
    rt.packs[2].fail!(undefined as never);
    await expect(unnamed).rejects.toThrow('loadSubpackage x: failed');
    expect(await p.loadFont('fonts/lilita.ttf', 'Lilita One')).toBe('Lilita One');
    expect(await p.loadFont('fonts/missing.woff', 'X')).toBeNull();
    rt.files.set('meta/balance.json', '{"a":1}');
    expect(await p.readText('meta/balance.json')).toBe('{"a":1}');
    expect((await p.readBinary('meta/balance.json')).byteLength).toBe(7);
    await expect(p.readText('gone.json')).rejects.toThrow('no such file');
  });

  it('drives the stick from touches and the first touch as Pixi\'s mouse', () => {
    const p = launch();
    const canvas: Record<string, unknown> = {};
    const stick = new DragStick();
    const down = vi.spyOn(stick, 'down');
    const up = vi.spyOn(stick, 'up');
    // what createApp does before Pixi's init, without the renderer
    (p as unknown as { bridge: unknown }).bridge = { dispatch: vi.fn() };
    const bridge = (p as unknown as { bridge: { dispatch: ReturnType<typeof vi.fn> } }).bridge;
    p.bindStick({ canvas } as unknown as Application, stick);
    rt.touch('touchstart', { identifier: 1, clientX: 10, clientY: 20 });
    rt.touch('touchstart', { identifier: 2, clientX: 50, clientY: 60 });
    rt.touch('touchmove', { identifier: 1, clientX: 12, clientY: 20 }, { identifier: 2, clientX: 55, clientY: 60 });
    rt.touch('touchcancel', { identifier: 2, clientX: 55, clientY: 60 });
    rt.touch('touchend', { identifier: 1, clientX: 12, clientY: 20 });
    expect(down.mock.calls).toEqual([[1, 10, 20], [2, 50, 60]]);
    expect(up.mock.calls).toEqual([[2], [1]]);
    expect(bridge.dispatch.mock.calls).toEqual([['mousedown', 10, 20], ['mousemove', 12, 20], ['mouseup', 12, 20]]);
  });
});
