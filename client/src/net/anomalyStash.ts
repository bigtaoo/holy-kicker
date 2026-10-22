import { ANOMALY_KINDS, type AnomalyProps } from '@hk/protocol';
import type { KeyValueStore } from '../meta/saveStore';

// The `anomaly` events of a release that has no backend to send them to (WeChat, until its
// domain is filed; a portal page that blocks the backend), kept on the device until a launch that
// has one sends them (anomaly.ts watchAnomalies). Only the newest STASH_MAX stay. They go out as
// events of that later launch: its time and build, not the ones they happened in.

export const STASH_KEY = 'hk.anomalies';
export const STASH_MAX = 20;

export class AnomalyStash {
  constructor(private readonly storage: KeyValueStore) {}

  push(props: AnomalyProps): void {
    this.write([...this.read(), props].slice(-STASH_MAX));
  }

  /** Every stashed event, oldest first; the stash is empty after. */
  take(): AnomalyProps[] {
    const out = this.read();
    if (out.length) this.write([]);
    return out;
  }

  private read(): AnomalyProps[] {
    try {
      const raw: unknown = JSON.parse(this.storage.getItem(STASH_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter(isProps) : [];
    } catch {
      return [];
    }
  }

  private write(list: AnomalyProps[]): void {
    this.storage.setItem(STASH_KEY, JSON.stringify(list));
  }
}

function isProps(p: unknown): p is AnomalyProps {
  const o = p as Partial<AnomalyProps> | null;
  return typeof o === 'object' && o !== null && ANOMALY_KINDS.includes(o.kind as AnomalyProps['kind']) && typeof o.place === 'string';
}
