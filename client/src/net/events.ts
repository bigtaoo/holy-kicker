import { LIMITS, type ClientEvent, type EventName, type PropValue } from '@hk/protocol';

// The analytics queue (server/README.md): events wait here until the backend takes them in
// batches. Pure, so the batching and the cap are tested without a network.

/** At most this many events wait; past it the oldest are dropped (a long offline session). */
export const QUEUE_CAP = 300;

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** A random id for an install or a session, 20 characters from `rand` (0 <= x < 1). */
export function newId(rand: () => number): string {
  let s = '';
  for (let i = 0; i < 20; i++) s += ID_CHARS[Math.floor(rand() * ID_CHARS.length)];
  return s;
}

export class EventQueue {
  private items: ClientEvent[] = [];

  get size(): number {
    return this.items.length;
  }

  push(e: EventName, t: number, p?: Record<string, PropValue>): void {
    this.items.push(p ? { e, t, p } : { e, t });
    if (this.items.length > QUEUE_CAP) this.items.splice(0, this.items.length - QUEUE_CAP);
  }

  /** Takes the oldest batch out; give it back with `restore` if sending failed. */
  take(): ClientEvent[] {
    return this.items.splice(0, LIMITS.batchEvents);
  }

  restore(batch: ClientEvent[]): void {
    this.items = [...batch, ...this.items].slice(-QUEUE_CAP);
  }
}
