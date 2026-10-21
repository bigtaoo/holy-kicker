import { actOf } from '@hk/engine';

// How the acts look (engine acts.ts, docs/design.md "Acts"), the pure part: the night over the
// ground from act 2, a little colder each act, and where an elite's or boss's affix badges sit
// (affixBadge.ts draws them). No Pixi here, so it is tested next to the source.

/** The ground's multiply tint by act: day, then a blue night, a violet one and the darkest. */
const NIGHT = [0xffffff, 0x9cacd8, 0xa49ad0, 0x8e8cbc];

/** The tint over chapter `chapter`'s ground and props (white by day). */
export function nightTint(chapter: number): number {
  return NIGHT[Math.min(Math.max(actOf(chapter), 1), NIGHT.length) - 1];
}

/** Two multiply tints as one (each channel a·b/255). */
export function multiplyTint(a: number, b: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) out |= Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255) << shift;
  return out;
}

/** The centres of `n` badges `size` wide with `gap` between them, in a row centred on 0. */
export function badgeOffsets(n: number, size: number, gap: number): number[] {
  const step = size + gap;
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * step);
}
