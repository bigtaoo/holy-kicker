import type { KeyValueStore } from '../../meta/saveStore';
import type { BuyOutcome, RestoreOutcome, Store } from '../types';
import type { HKNative, StoreResult, StoreState } from './bridge';

// The ad-free card through the shell's StoreKit (docs/ios.md "The ad-free card"). Ownership is
// StoreKit's: the shell reads the entitlements at every launch and pushes each change (a purchase,
// Ask to Buy approved later, a refund). The last answer is kept in the key store, so the first
// frame of an offline launch is already right. One buy or restore at a time; Apple's sheet stays
// up as long as the player wants, so neither has a timeout.

/** The card's product id in App Store Connect (Store.swift sells the same). */
export const AD_FREE_ID = 'com.gamestao.holykicker.adfree';
/** Where the last answer is kept: '1' owned, '0' not. */
export const AD_FREE_KEY = 'hk.adFree';

type Waiting = { op: 'buy'; resolve: (o: BuyOutcome) => void } | { op: 'restore'; resolve: (o: RestoreOutcome) => void };

export class StoreKit implements Store {
  /** Called whenever the price or ownership changes. */
  onChange: () => void = () => {};
  private state: StoreState | null;
  private kept: boolean;
  private waiting: Waiting | null = null;

  constructor(private readonly native: Partial<HKNative> | null, private readonly kv: KeyValueStore) {
    this.kept = kv.getItem(AD_FREE_KEY) === '1';
    this.state = typeof native?.store === 'function' ? clean(native.store.call(native)) : null;
    this.keep();
    native?.onStore?.call(native, (s) => {
      const before = this.signature();
      this.state = clean(s);
      this.keep();
      if (this.signature() !== before) this.onChange();
    });
    native?.onStoreResult?.call(native, (r) => this.result(r));
  }

  /** Whether the shell can sell at all (an older shell, or Safari, cannot). */
  available(): boolean {
    return typeof this.native?.buy === 'function';
  }

  price(): string | null {
    if (!this.state?.canPay) return null;
    return this.state.products.find((p) => p.id === AD_FREE_ID)?.price ?? null;
  }

  owned(): boolean {
    return this.state ? this.state.owned.includes(AD_FREE_ID) : this.kept;
  }

  buy(): Promise<BuyOutcome> {
    if (!this.available() || this.waiting) return Promise.resolve('failed');
    return new Promise((resolve) => {
      this.waiting = { op: 'buy', resolve };
      this.native?.buy?.call(this.native, AD_FREE_ID);
    });
  }

  restore(): Promise<RestoreOutcome> {
    if (typeof this.native?.restore !== 'function' || this.waiting) return Promise.resolve('failed');
    return new Promise((resolve) => {
      this.waiting = { op: 'restore', resolve };
      this.native?.restore?.call(this.native);
    });
  }

  private result(r: unknown): void {
    const w = this.waiting;
    if (!w || !r || typeof r !== 'object') return;
    const { op, outcome } = r as Partial<Record<keyof StoreResult, unknown>>;
    if (op !== w.op) return;
    this.waiting = null;
    if (w.op === 'buy') w.resolve(outcome === 'owned' || outcome === 'cancelled' || outcome === 'pending' ? outcome : 'failed');
    else w.resolve(outcome === 'owned' || outcome === 'none' || outcome === 'cancelled' ? outcome : 'failed');
  }

  /** Writes StoreKit's answer down once it has one. */
  private keep(): void {
    if (!this.state) return;
    const owned = this.owned();
    if (owned === this.kept) return;
    this.kept = owned;
    this.kv.setItem(AD_FREE_KEY, owned ? '1' : '0');
  }

  private signature(): string {
    return `${this.owned()}|${this.price()}`;
  }
}

/** The shell's state as the page trusts it: anything malformed reads as unknown. */
function clean(s: unknown): StoreState | null {
  if (!s || typeof s !== 'object') return null;
  const r = s as Record<string, unknown>;
  const products = Array.isArray(r.products)
    ? r.products.flatMap((p: unknown) => {
      const { id, price } = (p ?? {}) as Record<string, unknown>;
      return typeof id === 'string' && typeof price === 'string' && price ? [{ id, price: price.slice(0, 24) }] : [];
    })
    : [];
  const owned = Array.isArray(r.owned) ? r.owned.filter((id): id is string => typeof id === 'string') : [];
  return { products, owned, canPay: r.canPay !== false };
}
