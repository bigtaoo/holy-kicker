import { isMidBoss, mapOf, WAVES } from '@hk/engine';
import type { Key } from '../i18n';

// The light story (docs/content.md "Story"): one line before each boss and one after it. The
// line before rides the boss wave's banner, spoken by the boss (the monk faces the mute twins);
// the mid-boss's line after rides the next wave's banner, which only starts once it fell; after
// the chapter boss the won run stands still on the monk's line before the results. Hard mode
// replays the same lines, and so do the later acts, by map (chapter 7 is the marsh's), but for the
// temple map's mid-boss from chapter 6, the Inner Demon, who has no lines there.

/** A line of the story: the i18n keys of who speaks and what they say. */
export interface StoryLine {
  who: Key;
  say: Key;
}

type Moment = 'midBefore' | 'midAfter' | 'bossBefore' | 'bossAfter';

const MONK: Key = 'story.monk';

/** Seconds the won run stands on the monk's line before the results. */
export const CLEAR_LINE_TIME = 3.5;

/** Who speaks before each chapter's mid-boss: the twins are mute, the rest is the last chapter's boss. */
const MID_SPEAKER: readonly Key[] = [MONK, 'boss.empowered', 'boss.carpEmpowered', 'boss.witchEmpowered', 'boss.judgeEmpowered'];
const BOSS_SPEAKER: readonly Key[] = ['boss.abbot', 'boss.carp', 'boss.witch', 'boss.judge', 'boss.demon'];

function say(c: number, moment: Moment): Key {
  return `story.c${c as 1 | 2 | 3 | 4 | 5}.${moment}`;
}

/** The line for the banner of `wave` in `chapter` (`last` waves), or null for a wave without one. */
export function waveLine(chapter: number, wave: number, last: number): StoryLine | null {
  const c = mapOf(chapter);
  // the first mid-boss has the story's lines, also when it ends the run (a 20-wave challenge)
  const mid = WAVES.midBosses[0];
  const midLines = c > 1 || chapter <= 1;
  if (wave === mid && isMidBoss(wave, last)) return !midLines ? null : { who: MID_SPEAKER[c - 1], say: say(c, 'midBefore') };
  if (wave === last) return isMidBoss(wave, last) ? null : { who: BOSS_SPEAKER[c - 1], say: say(c, 'bossBefore') };
  if (wave === mid + 1 && isMidBoss(mid, last) && midLines) return { who: MONK, say: say(c, 'midAfter') };
  return null;
}

/** The monk's line once the run is won on `wave` of `last`: after `chapter`'s boss, or after the mid-boss that ended a shorter run. */
export function clearLine(chapter: number, wave: number, last: number): StoryLine {
  return { who: MONK, say: say(mapOf(chapter), isMidBoss(wave, last) ? 'midAfter' : 'bossAfter') };
}
