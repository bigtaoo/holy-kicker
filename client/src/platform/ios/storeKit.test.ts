import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../meta/saveStore';
import type { HKNative, StoreResult, StoreState } from './bridge';
import { AD_FREE_ID, AD_FREE_KEY, StoreKit } from './storeKit';

// The ad-free card as the page sees it through the shell's StoreKit: the price, who owns it, and
// one buy or restore at a time.

const FOR_SALE: StoreState = { products: [{ id: AD_FREE_ID, price: 'US$3.99' }], owned: [], canPay: true };
const OWNED: StoreState = { ...FOR_SALE, owned: [AD_FREE_ID] };

function shell(initial: StoreState | null = null) {
  let state: ((s: StoreState) => void) | null = null;
  let result: ((r: StoreResult) => void) | null = null;
  const asked: string[] = [];
  const native: Partial<HKNative> = {
    store: () => initial,
    onStore: (cb) => (state = cb),
    onStoreResult: (cb) => (result = cb),
    buy: (id) => asked.push(`buy ${id}`),
    restore: () => asked.push('restore'),
  };
  return {
    native,
    asked,
    push: (s: unknown) => state?.(s as StoreState),
    result: (r: unknown) => result?.(r as StoreResult),
  };
}

describe('StoreKit', () => {
  it('sells nothing without the bridge', async () => {
    for (const native of [null, {}]) {
      const store = new StoreKit(native, new MemoryStore());
      expect(store.available()).toBe(false);
      expect(store.price()).toBeNull();
      expect(store.owned()).toBe(false);
      expect(await store.buy()).toBe('failed');
      expect(await store.restore()).toBe('failed');
    }
  });

  it("shows the storefront's price once StoreKit answers, and none where purchases are blocked", () => {
    const s = shell();
    const store = new StoreKit(s.native, new MemoryStore());
    expect(store.available()).toBe(true);
    expect(store.price()).toBeNull();
    s.push(FOR_SALE);
    expect(store.price()).toBe('US$3.99');
    s.push({ ...FOR_SALE, canPay: false });
    expect(store.price()).toBeNull();
    // another product, or none loaded (offline, agreement not active)
    s.push({ ...FOR_SALE, products: [{ id: 'other', price: '1 €' }] });
    expect(store.price()).toBeNull();
  });

  it("keeps StoreKit's last answer for the next launch, and trusts it until StoreKit speaks", () => {
    const kv = new MemoryStore();
    const s = shell();
    const store = new StoreKit(s.native, kv);
    s.push(OWNED);
    expect(store.owned()).toBe(true);
    expect(kv.getItem(AD_FREE_KEY)).toBe('1');
    // the next launch, offline: no state yet
    const next = new StoreKit(shell().native, kv);
    expect(next.owned()).toBe(true);
    // a refund
    const later = shell(FOR_SALE);
    expect(new StoreKit(later.native, kv).owned()).toBe(false);
    expect(kv.getItem(AD_FREE_KEY)).toBe('0');
  });

  it('tells the page when the price or ownership changes, and only then', () => {
    const s = shell();
    const store = new StoreKit(s.native, new MemoryStore());
    let changes = 0;
    store.onChange = () => changes++;
    s.push(FOR_SALE);
    s.push({ ...FOR_SALE });
    expect(changes).toBe(1);
    s.push(OWNED);
    expect(changes).toBe(2);
  });

  it('buys through the shell, one at a time, with the outcome it reports', async () => {
    const s = shell(FOR_SALE);
    const store = new StoreKit(s.native, new MemoryStore());
    const buying = store.buy();
    expect(await store.buy()).toBe('failed');
    expect(await store.restore()).toBe('failed');
    expect(s.asked).toEqual([`buy ${AD_FREE_ID}`]);
    // a restore's answer does not settle a buy
    s.result({ op: 'restore', outcome: 'none' });
    s.push(OWNED);
    s.result({ op: 'buy', outcome: 'owned' });
    expect(await buying).toBe('owned');
    expect(store.owned()).toBe(true);
    for (const outcome of ['cancelled', 'pending', 'failed', 'none', 'odd', undefined]) {
      const next = store.buy();
      s.result({ op: 'buy', outcome });
      expect(await next).toBe(outcome === 'cancelled' || outcome === 'pending' ? outcome : 'failed');
    }
  });

  it('restores through the shell', async () => {
    const s = shell(FOR_SALE);
    const store = new StoreKit(s.native, new MemoryStore());
    for (const outcome of ['owned', 'none', 'cancelled', 'failed', 'pending']) {
      const restoring = store.restore();
      s.result({ op: 'restore', outcome });
      expect(await restoring).toBe(outcome === 'pending' ? 'failed' : outcome);
    }
    expect(s.asked).toEqual(['restore', 'restore', 'restore', 'restore', 'restore']);
  });

  it('reads anything malformed as nothing for sale and nothing owned', () => {
    const s = shell();
    const store = new StoreKit(s.native, new MemoryStore());
    s.push({ products: [null, { id: AD_FREE_ID }, { id: 3, price: 'x' }], owned: [7, null], canPay: 'yes' });
    expect(store.price()).toBeNull();
    expect(store.owned()).toBe(false);
    s.push('nonsense');
    expect(store.owned()).toBe(false);
  });
});
