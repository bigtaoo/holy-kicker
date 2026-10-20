// A theme's own words (docs/reskin.md "Words"): the shared tables hold the strings both games use,
// and each theme's tables (i18n/monk, i18n/corgi) the ones that name its world, at keys the shared
// tables leave out. A build lays its theme's words over the shared table of each language.

/** `A` and `B` together, key for key, `B` winning where both name a string. */
export type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? K extends keyof A
      ? B[K] extends string
        ? B[K]
        : Merge<A[K], B[K]>
      : B[K]
    : K extends keyof A
      ? A[K]
      : never;
};

type Node = { [key: string]: string | Node };

/** `base` with `words` laid over it; neither table is changed. */
export function overlay<A extends object, B extends object>(base: A, words: B): Merge<A, B> {
  const out: Node = { ...(base as Node) };
  for (const [k, v] of Object.entries(words as Node)) {
    const b = out[k];
    out[k] = typeof v === 'string' || typeof b !== 'object' ? v : overlay(b, v);
  }
  return out as Merge<A, B>;
}
