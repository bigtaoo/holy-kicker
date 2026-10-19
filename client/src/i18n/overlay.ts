// A theme's own words (docs/reskin.md): a partial table whose strings replace the base table's,
// key for key. Every key it names must exist in the base table, so a theme can rename things but
// never add text the game does not ask for.

/** Some of `T`'s strings, at the same paths. */
export type Override<T> = { [K in keyof T]?: T[K] extends string ? string : Override<T[K]> };

type Node = { [key: string]: string | Node };

/** `base` with every string `over` names replaced; neither table is changed. */
export function overlay<T extends object>(base: T, over: object | undefined): T {
  if (!over) return base;
  const out: Node = { ...(base as Node) };
  for (const [k, v] of Object.entries(over as Node)) {
    const b = out[k];
    out[k] = typeof v === 'string' || typeof b !== 'object' ? v : overlay(b, v);
  }
  return out as T;
}
