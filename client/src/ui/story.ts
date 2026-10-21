import { actOf, CHAPTERS, isMidBoss, mapOf, rushOf, WAVES } from '@hk/engine';
import type { Key } from '../i18n';

// The light story (docs/content.md "Story"): one line before each boss and one after it. The
// line before rides the boss wave's banner, spoken by the boss (the monk faces the mute twins);
// the mid-boss's line after rides the next wave's banner, which only starts once it fell; after
// the chapter boss the won run stands still on the monk's line before the results. Hard mode
// replays the same lines. The later acts push the story on, one set of lines an act, spoken by the
// map's foes (chapter 7's are the marsh's), with an opening line on wave 1: the demon's shadows
// possess them at night (act 2), its fragments corrupt them (act 3), it calls them all back one by
// one (act 4, the rush's leader speaking before it), and the last chapter is the final battle. The
// temple map's mid-boss from chapter 6, the Inner Demon, has no lines.

/** A line of the story: the i18n keys of who speaks and what they say. */
export interface StoryLine {
  who: Key;
  say: Key;
}

type Moment = 'midBefore' | 'midAfter' | 'bossBefore' | 'bossAfter';

const MONK: Key = 'story.monk';
const DEMON: Key = 'boss.demon';
/** Who opens acts 2, 3 and 4 on wave 1: the monk sees the night fall, then the demon speaks. */
const OPENER: readonly Key[] = [MONK, DEMON, DEMON];

/** Seconds the won run stands on the monk's line before the results. */
export const CLEAR_LINE_TIME = 3.5;

/** Who speaks before each chapter's mid-boss: the twins are mute, the rest is the last chapter's boss. */
const MID_SPEAKER: readonly Key[] = [MONK, 'boss.empowered', 'boss.carpEmpowered', 'boss.witchEmpowered', 'boss.judgeEmpowered'];
const BOSS_SPEAKER: readonly Key[] = ['boss.abbot', 'boss.carp', 'boss.witch', 'boss.judge', 'boss.demon'];

/** The line of `moment` in `chapter`: act 1's by map, the later acts' by act, the last chapter's boss its own. */
function say(chapter: number, moment: Moment): Key {
  const act = actOf(chapter);
  if (act <= 1) return `story.c${mapOf(chapter) as 1 | 2 | 3 | 4 | 5}.${moment}`;
  if (chapter === CHAPTERS && (moment === 'bossBefore' || moment === 'bossAfter')) return `story.finale.${moment}`;
  return `story.a${act as 2 | 3 | 4}.${moment}`;
}

/** Who speaks before the chapter boss: the map's boss, or the rush's leader (the demon itself in the last chapter). */
function bossSpeaker(chapter: number): Key {
  if (chapter === CHAPTERS) return DEMON;
  return actOf(chapter) > 1 ? `boss.${rushOf(chapter)[0]}` : BOSS_SPEAKER[mapOf(chapter) - 1];
}

/** The line for the banner of `wave` in `chapter` (`last` waves), or null for a wave without one. */
export function waveLine(chapter: number, wave: number, last: number): StoryLine | null {
  const c = mapOf(chapter);
  const act = actOf(chapter);
  if (wave === 1 && act > 1) return { who: OPENER[act - 2], say: `story.a${act as 2 | 3 | 4}.open` };
  // the first mid-boss has the story's lines, also when it ends the run (a 20-wave challenge)
  const mid = WAVES.midBosses[0];
  const midLines = c > 1 || chapter <= 1;
  if (wave === mid && isMidBoss(wave, last)) return !midLines ? null : { who: MID_SPEAKER[c - 1], say: say(chapter, 'midBefore') };
  if (wave === last) return isMidBoss(wave, last) ? null : { who: bossSpeaker(chapter), say: say(chapter, 'bossBefore') };
  if (wave === mid + 1 && isMidBoss(mid, last) && midLines) return { who: MONK, say: say(chapter, 'midAfter') };
  return null;
}

/** The monk's line once the run is won on `wave` of `last`: after `chapter`'s boss, or after the mid-boss that ended a shorter run. */
export function clearLine(chapter: number, wave: number, last: number): StoryLine {
  return { who: MONK, say: say(chapter, isMidBoss(wave, last) ? 'midAfter' : 'bossAfter') };
}
