// Picking out the mobs that hurt the hero. In a crowd round the hero every mob flashes white
// under the spells, and the ones biting him got lost among them: a mob touching the hero when
// he is hurt, or a water ghost rising beside him, is a threat for a while. It skips the white
// flash and wears a red rim (hordeView.ts). For a moment after each blow the effects and
// numbers round the hero fade too, so the biters show through them.

/** Seconds a mob stays a threat after a blow; longer than the sim's hurt cooldown, so a mob that keeps biting stays red. */
export const THREAT_TIME = 1.2;
/** The rim fades out over the last this many seconds. */
const THREAT_FADE = 0.4;
/** World units from the hero within which a mob counts as touching him (past engine HURT.crowdDist, for the drawn ease). */
export const THREAT_REACH = 160;

/** The rim's alpha with `left` seconds of threat left. */
export function threatAlpha(left: number): number {
  return left <= 0 ? 0 : Math.min(1, left / THREAT_FADE);
}

/** Seconds the effects round the hero stay faded after a blow. */
export const ALARM_TIME = 0.5;
/** Effects within this many world units of the hero fade, easing back to solid over ALARM_EDGE more. */
const ALARM_R = 200;
const ALARM_EDGE = 60;
/** How far they fade at most. */
const ALARM_DIM = 0.5;
/** The last this many seconds ease back. */
const ALARM_EASE = 0.15;

/** How much the fade is on (0..1) with `left` seconds of it left. */
export function alarmLevel(left: number): number {
  return left <= 0 ? 0 : Math.min(1, left / ALARM_EASE);
}

/** Alpha factor for an effect at (dx, dy) from the hero while the fade is `level` (alarmLevel) on. */
export function alarmFade(level: number, dx: number, dy: number): number {
  if (level <= 0) return 1;
  const d2 = dx * dx + dy * dy;
  if (d2 >= (ALARM_R + ALARM_EDGE) ** 2) return 1;
  const near = d2 <= ALARM_R * ALARM_R ? 1 : 1 - (Math.sqrt(d2) - ALARM_R) / ALARM_EDGE;
  return 1 - ALARM_DIM * level * near;
}

/** The fade round the hero: where he stands and how much it is on, for the layers to apply. */
export interface Alarm {
  x: number;
  y: number;
  level: number;
}
