// WeChat canvas -> Pixi EventSystem bridge (adapted from daydayup).
//
// Pixi's EventSystem attaches DOM listeners during Application.init, but the wx canvas has
// no DOM event API. This installs a minimal listener registry on the canvas so init works,
// and lets the platform feed one touch at a time into it as a synthetic mouse pointer, so
// Pixi's own interaction (eventMode + pointertap on UI buttons) works in the mini-game.
//
// Why mouse events: EventSystem chooses its wiring from `globalThis.PointerEvent` and
// `'ontouchstart' in globalThis`, neither of which exists in a mini-game, so it always takes
// the mouse branch. That branch listens for `mouseup` on globalThis and `mousemove` on
// globalThis.document rather than on the canvas, so those two registrations are tapped too.

export type WeChatSyntheticPointerType = 'mousedown' | 'mousemove' | 'mouseup';

export interface WeChatEventBridge {
  dispatch(type: WeChatSyntheticPointerType, clientX: number, clientY: number): void;
}

type Listener = (evt: unknown) => void;

interface ListenerTarget {
  addEventListener: (type: string, fn: Listener, ...rest: unknown[]) => void;
  removeEventListener?: (type: string, fn: Listener, ...rest: unknown[]) => void;
}

/** Must run before Application.init(): listeners registered earlier are lost for good. */
export function installWeChatEventBridge(
  canvas: unknown,
  globalTarget: unknown = globalThis,
  docTarget: unknown = (globalThis as { document?: unknown }).document,
): WeChatEventBridge {
  const listeners = new Map<string, Set<Listener>>();
  const on = (type: string, fn: Listener) => {
    let set = listeners.get(type);
    if (!set) listeners.set(type, (set = new Set()));
    set.add(fn);
  };
  const off = (type: string, fn: Listener) => {
    listeners.get(type)?.delete(fn);
  };

  const c = canvas as ListenerTarget;
  c.addEventListener = on;
  c.removeEventListener = off;
  tap(globalTarget, 'mouseup', on, off);
  tap(docTarget, 'mousemove', on, off);

  return {
    dispatch(type, clientX, clientY) {
      const set = listeners.get(type);
      if (!set || set.size === 0) return;
      const evt = {
        type,
        target: canvas,
        clientX,
        clientY,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1,
        // EventSystem calls preventDefault() on events without a `cancelable` property.
        preventDefault() {},
      };
      for (const fn of [...set]) fn(evt);
    },
  };
}

/** Best-effort: a missing or unwritable global only means that event type never reaches Pixi. */
function tap(
  target: unknown,
  type: string,
  on: (type: string, fn: Listener) => void,
  off: (type: string, fn: Listener) => void,
): void {
  const t = target as Partial<ListenerTarget> | null | undefined;
  if (!t || typeof t.addEventListener !== 'function') return;
  try {
    const originalAdd = t.addEventListener.bind(t);
    const originalRemove = t.removeEventListener?.bind(t);
    t.addEventListener = (evtType: string, fn: Listener, ...rest: unknown[]) => {
      if (evtType === type) on(evtType, fn);
      originalAdd(evtType, fn, ...rest);
    };
    if (originalRemove) {
      t.removeEventListener = (evtType: string, fn: Listener, ...rest: unknown[]) => {
        if (evtType === type) off(evtType, fn);
        originalRemove(evtType, fn, ...rest);
      };
    }
  } catch {
    // best-effort, see doc comment above
  }
}
