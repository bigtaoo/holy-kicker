// What the system says about the player and the device, from CSS media queries. Hosts without
// them (WeChat) answer no to both.

const query = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;

/** The player's "reduce motion" wish (prefers-reduced-motion): no screen shake and a softer white flash. */
export function reducedMotion(): boolean {
  return query('(prefers-reduced-motion: reduce)');
}

/** A phone or tablet with no mouse: turned on its side it gets the "turn upright" cover (viewport.ts wantsUpright). */
export function touchOnly(): boolean {
  return query('(hover: none) and (pointer: coarse)');
}
