/**
 * A browser as far as the web-based platform adapters touch it: a document and a window whose
 * events a test fires (going to the background and back), a localStorage that can be full,
 * blocked or refuse every write (Safari's private mode), and DOM elements enough for the
 * adapters' own dialogs. Install it with `stubBrowser()` (vi.stubGlobal for each global);
 * `browserGlobals` in adHosts.ts is the lighter fake for tests that only construct a platform.
 */

type Listener = (e: FakeEvent) => void;

export interface FakeEvent {
  type: string;
  key?: string;
  persisted?: boolean;
  stopped: boolean;
  stopPropagation(): void;
  preventDefault(): void;
}

export function fakeEvent(type: string, init: Partial<FakeEvent> = {}): FakeEvent {
  return { type, stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {}, ...init };
}

export class FakeTarget {
  private readonly listeners = new Map<string, Listener[]>();
  /** Set by the platform code that wants the parent to see the event, as in the DOM. */
  parent: FakeTarget | null = null;

  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  /** Fires `type` here, then bubbles it up the parents until a listener stops it. */
  dispatch(type: string, init: Partial<FakeEvent> = {}): FakeEvent {
    const e = fakeEvent(type, init);
    for (let t: FakeTarget | null = this; t && !e.stopped; t = t.parent) {
      for (const fn of t.listeners.get(type) ?? []) fn(e);
    }
    return e;
  }
  /** Event types with a listener here. */
  types(): string[] {
    return [...this.listeners].filter(([, fns]) => fns.length > 0).map(([type]) => type);
  }
}

export class FakeElement extends FakeTarget {
  id = '';
  className = '';
  textContent = '';
  value = '';
  placeholder = '';
  maxLength = -1;
  readOnly = false;
  style = { cssText: '', display: '' } as Record<string, string>;
  onclick: (() => void) | null = null;
  readonly children: FakeElement[] = [];

  constructor(readonly tagName: string, private readonly doc: FakeDocument) {
    super();
  }
  append(...nodes: FakeElement[]): void {
    for (const n of nodes) {
      n.remove();
      n.parent = this;
      this.children.push(n);
    }
  }
  appendChild(node: FakeElement): FakeElement {
    this.append(node);
    return node;
  }
  remove(): void {
    const p = this.parent as FakeElement | null;
    if (p?.children) p.children.splice(p.children.indexOf(this), 1);
    this.parent = null;
  }
  focus(): void {
    this.doc.activeElement = this;
  }
  click(): void {
    this.onclick?.();
    this.dispatch('click');
  }
  select(): void {}
  setSelectionRange(): void {}
  setPointerCapture(id: number): void {
    this.captured.push(id);
  }
  readonly captured: number[] = [];
  /** Every element under this one, depth first. */
  all(): FakeElement[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  find(pred: (e: FakeElement) => boolean): FakeElement | undefined {
    return this.all().find(pred);
  }
}

export class FakeDocument extends FakeTarget {
  hidden = false;
  focused = true;
  activeElement: FakeElement | null = null;
  /** What `execCommand('copy')` answers; the commands run land in `commands`. */
  commandWorks = true;
  readonly commands: string[] = [];
  readonly head = new FakeElement('head', this);
  readonly body = new FakeElement('body', this);
  readonly fonts = { added: [] as unknown[], add(f: unknown) { this.added.push(f); } };

  constructor() {
    super();
    this.head.parent = this;
    this.body.parent = this;
  }
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
  getElementById(id: string): FakeElement | null {
    return [...this.head.all(), ...this.body.all()].find((e) => e.id === id) ?? null;
  }
  hasFocus(): boolean {
    return this.focused;
  }
  execCommand(cmd: string): boolean {
    this.commands.push(cmd);
    return this.commandWorks;
  }
}

/** How a fake localStorage answers: as normal, full (writes throw a QuotaExceededError), every
 *  write refused (Safari's private mode had a quota of 0), or not even reachable (a sandboxed
 *  iframe throws on `window.localStorage` itself). */
export type StorageMode = 'ok' | 'full' | 'readonly' | 'blocked';

export class FakeLocalStorage {
  readonly data = new Map<string, string>();
  mode: StorageMode = 'ok';
  /** Writes refused so far. */
  refused = 0;
  /** With mode 'ok', the most characters it holds across keys and values (a real one: about 5 MB). */
  quota = Infinity;

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    const size = [...this.data].reduce((n, [k, v]) => n + (k === key ? 0 : k.length + v.length), 0) + key.length + value.length;
    if (this.mode !== 'ok' || size > this.quota) {
      this.refused++;
      throw Object.assign(new Error("Failed to execute 'setItem' on 'Storage': exceeded the quota."), { name: 'QuotaExceededError' });
    }
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

export function fakeBrowser(o: { search?: string; storage?: FakeLocalStorage } = {}) {
  const document = new FakeDocument();
  const storage = o.storage ?? new FakeLocalStorage();
  const opened: string[] = [];
  const scrolls: [number, number][] = [];
  const window = new (class extends FakeTarget {
    devicePixelRatio = 2;
    get localStorage(): FakeLocalStorage {
      if (storage.mode === 'blocked') throw Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError' });
      return storage;
    }
    open(url: string) {
      opened.push(url);
      return null;
    }
    focus() {}
    scrollTo(x: number, y: number) {
      scrolls.push([x, y]);
    }
  })();
  return {
    document,
    window,
    storage,
    opened,
    scrolls,
    location: { search: o.search ?? '', href: `https://h.example/${o.search ?? ''}` },
    /** The tab goes to the background: hidden first, then visibilitychange, as browsers do. */
    hide() {
      document.hidden = true;
      document.dispatch('visibilitychange');
    },
    show() {
      document.hidden = false;
      document.dispatch('visibilitychange');
    },
    /** The page is left: a portal swapping the game's iframe out fires this alone. */
    pageHide: (persisted = false) => window.dispatch('pagehide', { persisted }),
    pageShow: (persisted = true) => window.dispatch('pageshow', { persisted }),
  };
}

export type FakeBrowser = ReturnType<typeof fakeBrowser>;

/** The globals of `b`, to pass to vi.stubGlobal one by one. */
export function browserStubs(b: FakeBrowser): Record<string, unknown> {
  return { document: b.document, window: b.window, location: b.location };
}
