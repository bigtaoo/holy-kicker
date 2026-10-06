// Seeded random numbers, after daydayup's engine/math/prng.ts: a full-period LCG whose seed
// and outputs pass through the MurmurHash3 finalizer, so nearby seeds do not give correlated
// streams and the low bits are as good as the high ones. Integer-only, so it is exact on
// every engine. Each concern gets its own stream, so adding draws in one system does not
// shift the numbers another system sees.

export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = mix32(seed >>> 0) || 1;
  }

  /** A stream that goes on from a raw state taken with peek() (a restored snapshot). */
  static resume(raw: number): Prng {
    const p = new Prng(0);
    p.state = raw >>> 0;
    return p;
  }

  /** The raw state, for hashing and snapshots; does not advance the stream. */
  peek(): number {
    return this.state >>> 0;
  }

  /** Integer in [0, max). */
  int(max: number): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return mix32(this.state) % max;
  }

  /** Integer in [lo, hi]. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  /** True with probability num / den. */
  chance(num: number, den: number): boolean {
    return this.int(den) < num;
  }
}

/** MurmurHash3's 32-bit finalizer: a bijection on uint32 with full avalanche. */
export function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
