import type { KeyValueStore } from './meta/saveStore';

// The art set this build ships (build/theme.mjs): 'monk' is Holy Kicker, 'corgi' the reskin
// (docs/reskin.md). Both may run on one origin (h.gamestao.com and h.gamestao.com/new), so the
// corgi keeps its saves under its own keys.
export type Theme = 'monk' | 'corgi';
export const THEME = __HK_THEME__ as Theme;

/** `store` with every key under `prefix`, so two games on one origin never read each other's save. */
export function prefixedStore(store: KeyValueStore, prefix: string): KeyValueStore {
  return {
    getItem: (key) => store.getItem(prefix + key),
    setItem: (key, value) => store.setItem(prefix + key, value),
  };
}

/** The browser store for this theme: the monk's keys as they always were, the others' prefixed. */
export function themedStore(store: KeyValueStore, theme: Theme = THEME): KeyValueStore {
  return theme === 'monk' ? store : prefixedStore(store, `${theme}:`);
}
