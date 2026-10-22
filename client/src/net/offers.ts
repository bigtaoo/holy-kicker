import type { OfferPlace, PropValue } from '@hk/protocol';

// The rewarded-ad funnel's `offer` event (protocol runWire.ts OFFER_PLACES): an offer's place
// coming up on a screen is reported once, `shown` when an ad was ready and `nofill` when none was;
// the tap's `taken` or `failed` comes from Shell.rewarded. Pure: no Pixi, no host.

export type OfferTrack = (e: 'offer', p: Record<string, PropValue>) => void;

/** The offers one screen draws (the lobby's three), each reported once the host has answered. */
export class OfferLog {
  private ready: boolean | null = null;
  private readonly drawn = new Set<OfferPlace>();
  private readonly told = new Set<OfferPlace>();

  constructor(private readonly track: OfferTrack) {}

  /** The host said whether a rewarded ad can play now. */
  answer(ok: boolean): void {
    this.ready = ok;
    this.report();
  }

  /** The offer at `at` came up on screen (drawn again later, it is not reported again). */
  place(at: OfferPlace): void {
    this.drawn.add(at);
    this.report();
  }

  private report(): void {
    if (this.ready === null) return;
    for (const at of this.drawn) {
      if (this.told.has(at)) continue;
      this.told.add(at);
      this.track('offer', { at, outcome: this.ready ? 'shown' : 'nofill' });
    }
  }
}

/** `available` passed through, reported as the offer at `at` (when `drawn`: copper 0 has nothing to double). */
export function offered(track: OfferTrack, at: OfferPlace, available: Promise<boolean>, drawn = true): Promise<boolean> {
  if (!drawn) return available;
  return available.then((ok) => {
    track('offer', { at, outcome: ok ? 'shown' : 'nofill' });
    return ok;
  });
}
