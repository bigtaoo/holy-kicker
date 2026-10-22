import type { Notifier } from '../types';
import type { HKNative, NotifyState } from './bridge';

// Local notifications through the shell (Notifications.swift, docs/ios.md "Reminders"): the
// system's permission and the booked reminders, by id. Only a shell of bridge v5 or later has
// them; `nativeNotifier` is null otherwise, and the game never offers reminders there.

export class NativeNotifier implements Notifier {
  /** Called whenever the permission changes (settings redraws its toggle). */
  onChange: () => void = () => {};
  private state: NotifyState['status'] = 'unknown';
  private asking: ((s: 'on' | 'off') => void) | null = null;

  constructor(private readonly native: Partial<HKNative>) {
    this.state = clean(native.notify?.call(native)) ?? 'unknown';
    native.onNotify?.call(native, (s) => {
      const next = clean(s);
      if (!next) return;
      const changed = next !== this.state;
      this.state = next;
      // the answer to a sheet: 'unknown' only if the system never showed it, which is a no
      if (this.asking) {
        const done = this.asking;
        this.asking = null;
        done(next === 'on' ? 'on' : 'off');
      }
      if (changed) this.onChange();
    });
  }

  status(): NotifyState['status'] {
    return this.state;
  }

  ask(): Promise<'on' | 'off'> {
    if (this.state !== 'unknown') return Promise.resolve(this.state);
    if (this.asking) return Promise.resolve('off');
    return new Promise((resolve) => {
      this.asking = resolve;
      this.native.notifyAsk?.call(this.native);
    });
  }

  schedule(id: string, at: number, title: string, body: string): void {
    if (this.state === 'on') this.native.notifySchedule?.call(this.native, id, at, title, body);
  }

  cancel(id: string): void {
    this.native.notifyCancel?.call(this.native, id);
  }
}

/** The shell's notifications, or null on a shell (or a browser) without them. */
export function nativeNotifier(native: Partial<HKNative> | null): NativeNotifier | null {
  if (!native || (native.v ?? 0) < 5) return null;
  const calls = [native.notify, native.onNotify, native.notifyAsk, native.notifySchedule, native.notifyCancel];
  return calls.every((f) => typeof f === 'function') ? new NativeNotifier(native) : null;
}

function clean(s: unknown): NotifyState['status'] | null {
  const status = s && typeof s === 'object' ? (s as Record<string, unknown>).status : null;
  return status === 'on' || status === 'off' || status === 'unknown' ? status : null;
}
