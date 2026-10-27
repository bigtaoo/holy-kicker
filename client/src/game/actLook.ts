import { actOf, mapOf } from '@hk/engine';
import { THEME, type Theme } from '../theme';

// How the acts look (engine acts.ts, docs/design.md "Acts"), the pure part: the night over the
// ground from act 2, a little colder each act, and where an elite's or boss's affix badges sit
// (affixBadge.ts draws them). No Pixi here, so it is tested next to the source.

/** The ground's multiply tint by act: day, then a blue night, a violet one and the darkest. */
const NIGHT = [0xffffff, 0x9cacd8, 0xa49ad0, 0x8e8cbc];

/**
 * How light each map's ground tile is (mean luma 0–255, `python tools/ground_light.py`), per theme.
 * A night falls in full on map 1; on a darker map it is weakened so that ground comes out as light
 * as map 1's in the same act (a dark street under the full night was near black). A map lighter
 * than map 1 keeps the full night.
 */
const GROUND_LIGHT: Record<Theme, readonly number[]> = {
  monk: [68, 65, 85, 57, 93],
  corgi: [81, 61, 93, 57, 58],
};

/** A colour's luma, 0–1. */
function luma(c: number): number {
  return (0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff)) / 255;
}

/** The tint over chapter `chapter`'s ground and props (white by day). */
export function nightTint(chapter: number, light: readonly number[] = GROUND_LIGHT[THEME]): number {
  const night = NIGHT[Math.min(Math.max(actOf(chapter), 1), NIGHT.length) - 1];
  const full = luma(night);
  if (full >= 1) return night;
  // the share of this night that leaves the ground as light as map 1's under the full one
  const want = Math.min(1, (light[0] * full) / light[mapOf(chapter) - 1]);
  const k = Math.min(1, (1 - want) / (1 - full));
  let out = 0;
  for (const shift of [16, 8, 0]) out |= Math.round(255 - (255 - ((night >> shift) & 0xff)) * k) << shift;
  return out;
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
