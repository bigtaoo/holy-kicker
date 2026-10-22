import { cleanMsg, errorSource } from './anomaly';

// Errors thrown before the anomaly reporter is up (watchAnomalies registers once the shell is
// built, late in boot): caught from the first import of boot.ts on and handed to the reporter, or,
// when boot itself fails, to the anomaly stash for the next launch (boot.ts). Only the first
// EARLY_MAX are kept. WeChat has no window: its host's error hook goes through the platform.

export const EARLY_MAX = 10;

export interface EarlyError {
  msg: string;
  src?: string;
}

type ErrorTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

let caught: EarlyError[] = [];
let detach: (() => void) | null = null;

/** Starts catching window errors and unhandled rejections; a no-op without a window or once caught. */
export function catchEarlyErrors(win: ErrorTarget | undefined = typeof window === 'undefined' ? undefined : window): void {
  if (detach || typeof win?.addEventListener !== 'function') return;
  const keep = (e: EarlyError) => {
    if (caught.length < EARLY_MAX) caught.push(e);
  };
  const onError = (e: ErrorEvent) => {
    const src = errorSource(e.filename, e.lineno, e.colno);
    keep({ msg: cleanMsg(e.error ?? e.message), ...(src ? { src } : {}) });
  };
  const onRejection = (e: PromiseRejectionEvent) => keep({ msg: cleanMsg(e.reason) });
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  detach = () => {
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Everything caught so far, oldest first; stops catching (the reporter's own listeners take over). */
export function takeEarlyErrors(): EarlyError[] {
  detach?.();
  detach = null;
  const out = caught;
  caught = [];
  return out;
}

catchEarlyErrors();
