import { isMidBoss, WAVES } from '@hk/engine';
import type { Key } from '../i18n';

// The light story (docs/content.md "Story"): one line before each boss and one after it. The
// line before rides the boss wave's banner, spoken by the boss (the monk faces the mute twins);
// the mid-boss's line after rides the next wave's banner, which only starts once it fell; after
// the chapter boss the won run stands still on the monk's line before the results. Hard mode
// replays the same lines.

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

function chapterOf(chapter: number): number {
  return Math.min(Math.max(chapter, 1), BOSS_SPEAKER.length);
}

function say(c: number, moment: Moment): Key {
  return `story.c${c as 1 | 2 | 3 | 4 | 5}.${moment}`;
}

/** The line for the banner of `wave` in `chapter` (`last` waves), or null for a wave without one. */
export function waveLine(chapter: number, wave: number, last: number): StoryLine | null {
  const c = chapterOf(chapter);
  if (wave === last) return { who: BOSS_SPEAKER[c - 1], say: say(c, 'bossBefore') };
  // the first mid-boss has the story's lines
  const mid = WAVES.midBosses[0];
  if (wave === mid && isMidBoss(wave, last)) return { who: MID_SPEAKER[c - 1], say: say(c, 'midBefore') };
  if (wave === mid + 1 && isMidBoss(mid, last)) return { who: MONK, say: say(c, 'midAfter') };
  return null;
}

/** The monk's line once `chapter`'s boss fell and the run is won. */
export function clearLine(chapter: number): StoryLine {
  return { who: MONK, say: say(chapterOf(chapter), 'bossAfter') };
}
