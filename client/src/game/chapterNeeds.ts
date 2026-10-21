import { ACTS, actRule, chapterBoss, mapOf, rushOf } from '@hk/engine';
import { BALANCE } from '../meta/balance';
import type { SheetBoss } from './artTypes';

// Which of the later maps' art a run draws, so a run can free what it does not (art loaded
// by chapterArt.ts). A chapter draws its map's (engine mapOf: chapter 7 is the marsh again).
// Each map's horde and elite stay in every later map (map 5's walkers are every earlier map's,
// the elites of one map come back on the next's last elite wave); a boss is fought in its own
// map and, empowered, as the next one's mid-boss, the Inner Demon (in the peak's art) on the
// temple map from chapter 6 (cast.ts makeBosses). From act 2 the next map's newcomers join the
// horde, from act 3 split affixes send out the snow map's bone crawlers, and from act 4 the last
// wave is a rush of bosses (engine acts.ts). Map 1's art is in from the start and always stays.

export type ChapterPiece = 'marsh' | 'snow' | 'ghost' | 'peak' | SheetBoss;

/** In load order: the packs come in chapter by chapter. */
export const CHAPTER_PIECES: readonly ChapterPiece[] = ['marsh', 'carp', 'snow', 'witch', 'ghost', 'judge', 'peak'];

/** The map whose horde and elite each piece holds. */
const HORDE_FROM: Partial<Record<ChapterPiece, number>> = { marsh: 2, snow: 3, ghost: 4, peak: 5 };

const SHEET_BOSSES: readonly ChapterPiece[] = ['carp', 'witch', 'judge'];

/** What a run of chapter `chapter` (0 for the sandbox) draws. */
export function piecesFor(chapter: number): Set<ChapterPiece> {
  const out = new Set<ChapterPiece>();
  const own = chapter > 0 ? mapOf(chapter) : 0;
  const map = chapter > 0 && actRule(chapter, ACTS.mix) ? Math.max(own, mapOf(chapter + 1)) : own;
  for (const [piece, from] of Object.entries(HORDE_FROM)) if (map >= from) out.add(piece as ChapterPiece);
  if (chapter < 1) return out;
  if (actRule(chapter, ACTS.affixes)) out.add('snow');
  for (const boss of [...rushOf(chapter), chapter >= 2 ? chapterBoss(chapter - 1) : null]) {
    if (boss && SHEET_BOSSES.includes(boss as ChapterPiece)) out.add(boss as ChapterPiece);
    if (boss === 'demon') out.add('peak');
  }
  return out;
}

/** What stays loaded as a run of `chapter` starts: its own, and the next chapter's, which the lobby fetches ahead. */
export function piecesKept(chapter: number): Set<ChapterPiece> {
  return new Set([...piecesFor(chapter), ...piecesFor(Math.min(chapter + 1, BALANCE.chapters))]);
}
