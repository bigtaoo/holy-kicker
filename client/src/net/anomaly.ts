import { ANOMALY_CAP, ANOMALY_KINDS, LIMITS, STALL_MAX_MS, STALL_MS, type AnomalyProps, type PropValue } from '@hk/protocol';
import type { Application } from 'pixi.js';
import type { MemSample } from '../game/memProbe';
import type { Platform } from '../platform/types';
import type { Backend } from './backend';

// The `anomaly` event (server/src/protocol.ts AnomalyProps): something gone wrong on the device,
// sent as it happens. A broken device can repeat the same thing every frame, so each kind is
// capped per session. Every hook is feature-detected: WeChat has no window, and its canvas may
// not take event listeners.

type Kind = (typeof ANOMALY_KINDS)[number];

/** Where the player is now: the place, and the wave when in a run. */
export type Whereabouts = () => { place: string; wave?: number };

/** Lets each kind through ANOMALY_CAP times a session. */
export class AnomalyCap {
  private readonly sent = new Map<Kind, number>();

  pass(kind: Kind): boolean {
    const n = this.sent.get(kind) ?? 0;
    if (n >= ANOMALY_CAP) return false;
    this.sent.set(kind, n + 1);
    return true;
  }
}

/** An error message fit for a prop: printable ASCII only, whitespace runs folded, cut to LIMITS.propString. */
export function cleanMsg(raw: unknown): string {
  const text = raw instanceof Error ? raw.message || raw.name : typeof raw === 'string' ? raw : String(raw ?? '');
  return text.replace(/[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.propString) || 'unknown';
}

/**
 * Picks stalled battle frames out of the frame stream. A hidden tab stops requestAnimationFrame,
 * so the first frame back spans the whole absence: frames seen while hidden, and the first one
 * after the game went to the background, are never stalls, nor is a gap of STALL_MAX_MS or more.
 */
export class StallWatch {
  private away = false;

  /** The game went to the background. */
  hide(): void {
    this.away = true;
  }

  /** One battle frame; true when it is a stall. */
  frame(ms: number, hidden: boolean): boolean {
    if (hidden) {
      this.away = true;
      return false;
    }
    if (this.away) {
      this.away = false;
      return false;
    }
    return ms >= STALL_MS && ms < STALL_MAX_MS;
  }
}

/** Where an error was thrown: the script's file name (no path or query) with line and column, '' when unknown. */
export function errorSource(file: unknown, line: unknown, col: unknown): string {
  if (typeof file !== 'string' || !file) return '';
  const name = file.split(/[?#]/)[0].split('/').pop() || '';
  const at = [line, col].filter((n) => typeof n === 'number' && n > 0).join(':');
  return cleanMsg(at ? `${name}:${at}` : name);
}

/** What the game holds, as the anomaly props carry it. */
function held(m: MemSample): Partial<AnomalyProps> {
  return { tex: m.tex, texMB: m.texMB, nodes: m.nodes, ...(m.heap !== undefined ? { heap: m.heap } : {}) };
}

/** Hooks the anomaly sources up; the returned `frame` takes each battle frame's length (ms). */
export function watchAnomalies(app: Application, platform: Platform, net: Backend, probe: () => MemSample, where: Whereabouts): { frame(ms: number): void } {
  const cap = new AnomalyCap();
  const stalls = new StallWatch();
  const report = (kind: Kind, extra: Partial<AnomalyProps> = {}) => {
    const { place, wave } = where();
    if (!cap.pass(kind)) {
      // past the cap nothing goes out; a development build still prints it (backend.ts prints the rest)
      if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.info(`[anomaly] ${JSON.stringify({ kind, place, wave, ...extra })}`);
      return;
    }
    const props: AnomalyProps = { kind, place, ...extra };
    if (wave !== undefined) props.wave = wave;
    net.track('anomaly', props as unknown as Record<string, PropValue>);
  };
  const canvas = app.canvas as Partial<Pick<HTMLCanvasElement, 'addEventListener'>> | undefined;
  if (typeof canvas?.addEventListener === 'function') canvas.addEventListener('webglcontextlost', () => report('webgl_lost', held(probe())));
  const win = typeof window === 'undefined' ? undefined : window;
  if (typeof win?.addEventListener === 'function') {
    win.addEventListener('error', (e) => {
      const src = errorSource(e.filename, e.lineno, e.colno);
      report('error', { msg: cleanMsg(e.error ?? e.message), ...(src ? { src } : {}) });
    });
    win.addEventListener('unhandledrejection', (e) => report('error', { msg: cleanMsg(e.reason) }));
  }
  platform.onMemoryWarning?.((level) => report('memory', { level, ...held(probe()) }));
  platform.onHide(() => stalls.hide());
  const hidden = () => typeof document !== 'undefined' && document.hidden === true;
  return {
    frame(ms) {
      if (stalls.frame(ms, hidden())) report('stall', { ms: Math.round(ms) });
    },
  };
}
