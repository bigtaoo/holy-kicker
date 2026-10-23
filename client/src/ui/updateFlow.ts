import type { AppUpdates, UpdateOffer } from '../platform/types';

// When the lobby asks the player to take a hot update (docs/ios.md "Hot updates"), Pixi-free so
// it can be tested; ui/updatePrompt.ts draws it. One check per launch and per return from the
// background, made only while the lobby has nothing over it; a failed or offline check asks
// nothing. Later drops the offer until the next check; Update downloads it with its progress,
// and the host restarts the game into it. A failed download says so and can be tried again.

export type UpdateStep =
  | { step: 'none' }
  | { step: 'offer'; version: string }
  /** `f` 0..1; at 1 the game is restarting into the new bundle. */
  | { step: 'downloading'; f: number }
  | { step: 'failed' };

/** A download that reports nothing for this long counts as failed. */
export const STALL_MS = 45_000;

export class UpdateFlow {
  state: UpdateStep = { step: 'none' };
  /** A check is due: at launch, and after each return from the background. */
  private armed = true;
  private checking = false;
  /** The offer found, waiting for the lobby to be free. */
  private found: UpdateOffer | null = null;
  private attempt = 0;
  private heard = 0;

  constructor(
    private readonly updates: AppUpdates,
    /** The state changed: draw it again. */
    private readonly changed: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** The game went to the background: the next time the lobby is free, check again. */
  hidden(): void {
    this.armed = true;
    // an offer not yet shown may be stale by then
    this.found = null;
  }

  /** Each frame; `idle` is the lobby with nothing over it. */
  poll(idle: boolean): void {
    const s = this.state;
    if (s.step === 'downloading' && s.f < 1 && this.now() - this.heard > STALL_MS) return this.fail(this.attempt);
    if (s.step !== 'none' || !idle) return;
    if (this.found) {
      this.set({ step: 'offer', version: this.found.version });
      return;
    }
    if (!this.armed || this.checking) return;
    this.armed = false;
    this.checking = true;
    void this.updates.check().then(
      (offer) => {
        this.checking = false;
        // a return from the background meanwhile asks again instead
        if (!this.armed) this.found = offer;
      },
      () => {
        this.checking = false;
      },
    );
  }

  /** Not now: nothing more until the next check. */
  later(): void {
    this.found = null;
    this.set({ step: 'none' });
  }

  /** Download it (or try again), then restart into it. */
  update(): void {
    const offer = this.found;
    if (!offer) return this.later();
    const attempt = ++this.attempt;
    this.heard = this.now();
    this.set({ step: 'downloading', f: 0 });
    offer
      .install((f) => {
        const s = this.state;
        if (attempt !== this.attempt || s.step !== 'downloading') return;
        this.heard = this.now();
        if (f > s.f) this.set({ step: 'downloading', f });
      })
      .catch((e: unknown) => {
        console.warn('[ota] download failed:', e);
        this.fail(attempt);
      });
  }

  private fail(attempt: number): void {
    if (attempt !== this.attempt || this.state.step !== 'downloading') return;
    // a late answer from this attempt is ignored
    this.attempt++;
    this.set({ step: 'failed' });
  }

  private set(s: UpdateStep): void {
    this.state = s;
    this.changed();
  }
}
