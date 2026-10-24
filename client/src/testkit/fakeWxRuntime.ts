/**
 * The WeChat mini-game runtime (`wx`) as far as WeChatPlatform, its adapter and its music decks
 * call it, for tests that stub it in as a global. Storage is a map that can fail like the real
 * one (the 10 MB store full, a key over 1 MB, a store the runtime finds corrupt); the lifecycle,
 * touch and audio-interruption hooks are recorded for the test to fire. The ad API has its own
 * fake, `fakeWx` in adHosts.ts.
 */

type Cb<T = void> = (arg: T) => void;

export class FakeInnerAudio implements WxInnerAudioContext {
  src = '';
  loop = true;
  volume = 1;
  obeyMuteSwitch = false;
  currentTime = 0;
  duration = 60;
  paused = true;
  /** Every call, in order: play, pause, stop, and `src <path>` for each new file. */
  readonly calls: string[] = [];
  private errors: Cb<{ errMsg?: string; errCode?: number }>[] = [];

  constructor() {
    let src = '';
    Object.defineProperty(this, 'src', {
      get: () => src,
      set: (v: string) => {
        src = v;
        this.calls.push(`src ${v}`);
      },
    });
  }
  play(): void {
    this.paused = false;
    this.calls.push('play');
  }
  pause(): void {
    this.paused = true;
    this.calls.push('pause');
  }
  stop(): void {
    this.paused = true;
    this.currentTime = 0;
    this.calls.push('stop');
  }
  destroy(): void {
    this.calls.push('destroy');
  }
  onError(cb: Cb<{ errMsg?: string; errCode?: number }>): void {
    this.errors.push(cb);
  }
  /** The runtime could not play the file. */
  fail(errMsg = 'decode failed'): void {
    for (const cb of this.errors) cb({ errMsg, errCode: 10004 });
  }
}

export type WxStorageFailure = null | 'set' | 'get' | 'both';

export function fakeWxRuntime(o: { audio?: boolean; modal?: boolean } = {}) {
  const disk = new Map<string, unknown>();
  let failing: WxStorageFailure = null;
  const hooks = new Map<string, Cb<never>[]>();
  const hook = (name: string) => (cb: Cb<never>) => void hooks.set(name, [...(hooks.get(name) ?? []), cb]);
  const fire = (name: string, arg?: unknown) => (hooks.get(name) ?? []).forEach((cb) => (cb as Cb<unknown>)(arg));
  const canvases: Record<string, unknown>[] = [];
  const decks: FakeInnerAudio[] = [];
  const modals: Parameters<NonNullable<Wx['showModal']>>[0][] = [];
  const packs: { name: string; success?: () => void; fail?: (r: { errMsg?: string }) => void }[] = [];
  const files = new Map<string, string>();
  const written = new Map<string, string>();
  const vibrations: string[] = [];
  const ctx2d = new (class Ctx2D {})();
  const wx = {
    getStorageSync(key: string): unknown {
      if (failing === 'get' || failing === 'both') throw new Error('getStorageSync:fail data corrupted');
      return disk.has(key) ? disk.get(key) : '';
    },
    setStorageSync(key: string, data: unknown): void {
      if (failing === 'set' || failing === 'both') throw new Error('setStorageSync:fail exceed storage max size 10Mb');
      disk.set(key, data);
    },
    onHide: hook('hide'),
    onShow: hook('show'),
    onAudioInterruptionBegin: hook('interruptBegin'),
    onAudioInterruptionEnd: hook('interruptEnd'),
    onMemoryWarning: hook('memory'),
    onError: hook('error'),
    onUnhandledRejection: hook('rejection'),
    onTouchStart: hook('touchstart'),
    onTouchMove: hook('touchmove'),
    onTouchEnd: hook('touchend'),
    onTouchCancel: hook('touchcancel'),
    createCanvas() {
      const c: Record<string, unknown> = { width: 300, height: 150, getContext: () => ctx2d };
      canvases.push(c);
      return c;
    },
    createImage: () => ({ src: '' }),
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 47, bottom: 810 } }),
    getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 82, left: 300, right: 380 }),
    getAppBaseInfo: () => ({ language: 'zh_CN', SDKVersion: '3.4.1' }),
    getDeviceInfo: () => ({ brand: 'Xiaomi', model: '23078RKD5C', system: 'Android 14', platform: 'android', memorySize: 8192 }),
    getDeviceBenchmarkInfo: (opts: { success: Cb<{ modelLevel: number }> }) => opts.success({ modelLevel: 2 }),
    getBatteryInfo: (opts: { success: Cb<{ level: string; isCharging: boolean }> }) => opts.success({ level: '64', isCharging: true }),
    vibrateShort: (opts: { type: string }) => void vibrations.push(opts.type),
    loadSubpackage: (opts: (typeof packs)[number]) => void packs.push(opts),
    loadFont: (path: string) => (path.endsWith('.ttf') ? 'Lilita One' : null),
    env: { USER_DATA_PATH: 'wxfile://usr' },
    getFileSystemManager: () => ({
      readFileSync: (path: string, enc?: string) => {
        const f = files.get(path);
        if (f === undefined) throw new Error(`readFileSync:fail no such file ${path}`);
        return enc ? f : new TextEncoder().encode(f).buffer;
      },
      writeFileSync: (path: string, data: string) => void written.set(path, data),
    }),
    ...(o.modal === false ? {} : { showModal: (opts: (typeof modals)[number]) => void modals.push(opts) }),
    ...(o.audio === false ? {} : {
      createWebAudioContext: () => ({ kind: 'wx-web-audio' }),
      createInnerAudioContext: () => {
        const d = new FakeInnerAudio();
        decks.push(d);
        return d;
      },
    }),
  };
  return {
    wx,
    disk,
    canvases,
    decks,
    modals,
    packs,
    files,
    written,
    vibrations,
    ctx2d,
    /** From now on storage calls throw as named (null: they work again). */
    failStorage: (how: WxStorageFailure) => void (failing = how),
    hide: () => fire('hide'),
    show: () => fire('show'),
    fire,
    touch: (type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', ...touches: { identifier: number; clientX: number; clientY: number }[]) =>
      fire(type, { touches, changedTouches: touches }),
    hooked: (name: string) => (hooks.get(name) ?? []).length,
  };
}
