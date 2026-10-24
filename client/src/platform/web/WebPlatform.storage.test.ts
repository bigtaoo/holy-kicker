import { afterEach, describe, expect, it, vi } from 'vitest';
import { newSave } from '../../meta/save';
import { BACKUP_KEY, SAVE_KEY, SaveStore } from '../../meta/saveStore';
import { loadSettings, SETTINGS_KEY, updateSettings } from '../../meta/settings';
import { browserStubs, fakeBrowser, FakeLocalStorage, type FakeBrowser } from '../../testkit/fakeBrowser';
import { WebPlatform } from './WebPlatform';

// The browser host's save and lifecycle against a fake localStorage and page (testkit/fakeBrowser.ts):
// what is kept for the next launch, what happens when the storage is full, read-only or blocked,
// and when the game hears that the page went away.

let browser: FakeBrowser;

/** A launch of the web host over `storage`, the same disk as the launch before when passed. */
function launch(storage = new FakeLocalStorage()) {
  browser = fakeBrowser({ storage });
  for (const [k, v] of Object.entries(browserStubs(browser))) vi.stubGlobal(k, v);
  return new WebPlatform();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebPlatform storage', () => {
  it('keeps the save in localStorage for the next launch', () => {
    const disk = new FakeLocalStorage();
    const store = new SaveStore(launch(disk).storage);
    store.save({ ...store.load(), copper: 120, jade: 4 });
    expect(JSON.parse(disk.data.get(SAVE_KEY)!).copper).toBe(120);
    expect(disk.data.has(BACKUP_KEY)).toBe(true);
    const next = new SaveStore(launch(disk).storage).load();
    expect([next.copper, next.jade]).toEqual([120, 4]);
  });

  it('plays on from memory when the storage is full, and writes again once there is room', () => {
    const disk = new FakeLocalStorage();
    const store = new SaveStore(launch(disk).storage);
    store.save({ ...store.load(), copper: 10 });
    disk.mode = 'full';
    expect(() => store.save({ ...store.load(), copper: 20 })).not.toThrow();
    expect(disk.refused).toBeGreaterThan(0);
    // this session never rolls back to the copy the disk still has
    expect(store.load().copper).toBe(20);
    expect(JSON.parse(disk.data.get(SAVE_KEY)!).copper).toBe(10);
    disk.mode = 'ok';
    store.save({ ...store.load(), copper: 30 });
    expect(new SaveStore(launch(disk).storage).load().copper).toBe(30);
  });

  it('fills up on a big write without losing what it held', () => {
    const disk = new FakeLocalStorage();
    const p = launch(disk);
    p.storage.setItem('hk.small', 'x');
    disk.quota = 100;
    expect(() => p.storage.setItem('hk.big', 'y'.repeat(200))).not.toThrow();
    expect(p.storage.getItem('hk.big')).toBe('y'.repeat(200));
    expect([disk.data.get('hk.small'), disk.data.has('hk.big')]).toEqual(['x', false]);
  });

  it('runs a whole session where every write is refused (private mode) without a crash', () => {
    const disk = new FakeLocalStorage();
    disk.mode = 'readonly';
    const store = new SaveStore(launch(disk).storage);
    const s = store.load();
    expect(s.copper).toBe(newSave().copper);
    store.save({ ...s, copper: 77 });
    expect(store.load().copper).toBe(77);
    expect(disk.data.size).toBe(0);
  });

  it('runs from memory where localStorage itself throws (a sandboxed iframe)', () => {
    const disk = new FakeLocalStorage();
    disk.mode = 'blocked';
    const p = launch(disk);
    const store = new SaveStore(p.storage);
    store.save({ ...store.load(), copper: 5 });
    expect(store.load().copper).toBe(5);
    expect(p.storage.getItem('hk.never')).toBeNull();
  });

  it('keeps the privacy answer for the next launch, and a refused write never reads as a yes', () => {
    const disk = new FakeLocalStorage();
    updateSettings(launch(disk).storage, { dataSharing: 'no', noticeSeen: true });
    expect(loadSettings(launch(disk).storage)).toMatchObject({ dataSharing: 'no', noticeSeen: true });

    const full = new FakeLocalStorage();
    const p = launch(full);
    full.mode = 'full';
    updateSettings(p.storage, { dataSharing: 'yes' });
    // the answer holds for this session; the next launch asks again rather than assume one
    expect(loadSettings(p.storage).dataSharing).toBe('yes');
    expect(full.data.has(SETTINGS_KEY)).toBe(false);
    expect(loadSettings(launch(full).storage).dataSharing).toBe('ask');
  });
});

describe('WebPlatform going to the background', () => {
  it('tells the game once per time away: hidden, then the page left', () => {
    const p = launch();
    const hides = vi.fn();
    p.onHide(hides);
    browser.hide();
    browser.pageHide();
    expect(hides).toHaveBeenCalledTimes(1);
    browser.show();
    browser.hide();
    expect(hides).toHaveBeenCalledTimes(2);
  });

  it('hears a portal swapping its iframe out (pagehide alone), and again after the page is back', () => {
    const p = launch();
    const hides = vi.fn();
    p.onHide(hides);
    browser.pageHide(true);
    expect(hides).toHaveBeenCalledTimes(1);
    browser.pageShow(true);
    browser.pageHide();
    expect(hides).toHaveBeenCalledTimes(2);
  });

  it('writes what the hide callback saves before the page goes (localStorage is synchronous)', () => {
    const disk = new FakeLocalStorage();
    const p = launch(disk);
    const store = new SaveStore(p.storage);
    let copper = 0;
    p.onHide(() => store.save({ ...store.load(), copper: ++copper }));
    browser.pageHide();
    expect(JSON.parse(disk.data.get(SAVE_KEY)!).copper).toBe(1);
  });

  it('pauses the sound while the tab is hidden and resumes it when it is back', () => {
    vi.stubGlobal('AudioContext', class {});
    const p = launch();
    const focus = vi.fn();
    p.audio!.onFocus(focus);
    browser.hide();
    browser.show();
    expect(focus.mock.calls).toEqual([[false], [true]]);
    // the first tap, key or touch end resumes a context the autoplay rules held
    const gesture = vi.fn();
    p.audio!.onGesture(gesture);
    expect(browser.window.types()).toEqual(expect.arrayContaining(['pointerdown', 'pointerup', 'touchend', 'keydown']));
    browser.window.dispatch('touchend');
    expect(gesture).toHaveBeenCalledTimes(1);
  });

  it('has no sound where the browser has no Web Audio', () => {
    expect(launch().audio).toBeNull();
  });
});
