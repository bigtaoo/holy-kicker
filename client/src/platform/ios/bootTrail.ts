import type { AnomalyProps } from '@hk/protocol';

// What a launch of the iOS app got through, written to the device as it goes, so that a launch
// that never finished (a throw, the web view killed for memory, a hot update the updater rolled
// back) can be told about by the next one (main.ios.ts). Each step overwrites the record at once:
// nothing waits on the network, and a web view killed mid-boot leaves its last step behind. A
// launch that reaches `ready` (or reloads into a downloaded bundle) clears it.

export const TRAIL_KEY = 'hk.boot';
/** Errors kept per launch: the first ones say the most. */
export const TRAIL_ERRORS = 3;

export interface Trail {
  /** The bundle that booted (__HK_BUNDLE__) and its build (__HK_BUILD__). */
  bundle: string;
  build: string;
  /** The last step reached. */
  stage: string;
  /** ms from the script's start to that step. */
  ms: number;
  /** What the step said about itself, e.g. the canvas's resolution and MSAA. */
  info?: string;
  errors: string[];
}

type Kv = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A launch that never got to `ready`, as the anomaly the next launch sends; null for a clean one. */
export function unfinished(t: Trail | null): AnomalyProps | null {
  if (!t) return null;
  const p: AnomalyProps = { kind: 'boot_fail', place: 'boot', stage: t.stage, ms: Math.round(t.ms), bundle: t.bundle, build: t.build };
  if (t.info) p.info = t.info;
  if (t.errors.length) p.msg = t.errors[0];
  if (t.errors.length > 1) p.errors = t.errors.length;
  return p;
}

export class BootTrail {
  private trail: Trail;
  private readonly t0: number;

  /** Starts this launch's record; `last` is the launch before's when it never finished. */
  readonly last: AnomalyProps | null;

  constructor(
    private readonly kv: Kv,
    bundle: string,
    build: string,
    private readonly now: () => number,
  ) {
    this.last = unfinished(read(kv));
    this.trail = { bundle, build, stage: 'script', ms: 0, errors: [] };
    this.t0 = now();
    this.write();
  }

  step(stage: string, info?: string): void {
    this.trail = { ...this.trail, stage, ms: this.now() - this.t0, ...(info ? { info } : {}) };
    this.write();
  }

  error(msg: string): void {
    if (this.trail.errors.length >= TRAIL_ERRORS) return;
    this.trail = { ...this.trail, errors: [...this.trail.errors, msg] };
    this.write();
  }

  /** The launch made it (or hands over to another bundle): nothing for the next one to report. */
  done(): void {
    try {
      this.kv.removeItem(TRAIL_KEY);
    } catch {
      /* storage gone: the next launch reports a false failure at worst */
    }
  }

  private write(): void {
    try {
      this.kv.setItem(TRAIL_KEY, JSON.stringify(this.trail));
    } catch {
      /* storage full or gone: the trail is a diagnosis, never in the way of the game */
    }
  }
}

function read(kv: Kv): Trail | null {
  try {
    const t = JSON.parse(kv.getItem(TRAIL_KEY) ?? 'null') as Partial<Trail> | null;
    if (!t || typeof t.stage !== 'string' || typeof t.bundle !== 'string') return null;
    return {
      bundle: t.bundle,
      build: typeof t.build === 'string' ? t.build : '',
      stage: t.stage,
      ms: typeof t.ms === 'number' && Number.isFinite(t.ms) ? t.ms : 0,
      ...(typeof t.info === 'string' ? { info: t.info } : {}),
      errors: Array.isArray(t.errors) ? t.errors.filter((e): e is string => typeof e === 'string') : [],
    };
  } catch {
    return null;
  }
}
