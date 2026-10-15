import { chapterBoss } from '@hk/engine';
import { BALANCE } from '../meta/balance';
import type { SheetBoss } from './artTypes';

// Which of the later chapters' art a run draws, so a run can free what it does not (art loaded
// by chapterArt.ts). Each chapter's horde and elite stay in every later chapter (chapter 5's
// walkers are every earlier chapter's, the elites of one chapter come back on the next's last
// elite wave); a baked boss is fought in its own chapter and, empowered, as the next one's
// mid-boss (cast.ts makeBosses). Chapter 1's art is in from the start and always stays.

export type ChapterPiece = 'marsh' | 'snow' | 'ghost' | 'peak' | SheetBoss;

/** In load order: the packs come in chapter by chapter. */
export const CHAPTER_PIECES: readonly ChapterPiece[] = ['marsh', 'carp', 'snow', 'witch', 'ghost', 'judge', 'peak'];

/** The chapter whose horde and elite each piece holds. */
const HORDE_FROM: Partial<Record<ChapterPiece, number>> = { marsh: 2, snow: 3, ghost: 4, peak: 5 };

const SHEET_BOSSES: readonly ChapterPiece[] = ['carp', 'witch', 'judge'];

/** What a run of chapter `chapter` (0 for the sandbox) draws. */
export function piecesFor(chapter: number): Set<ChapterPiece> {
  const out = new Set<ChapterPiece>();
  for (const [piece, from] of Object.entries(HORDE_FROM)) if (chapter >= from) out.add(piece as ChapterPiece);
  if (chapter < 1) return out;
  for (const boss of [chapterBoss(chapter), chapter >= 2 ? chapterBoss(chapter - 1) : null]) {
    if (boss && SHEET_BOSSES.includes(boss as ChapterPiece)) out.add(boss as ChapterPiece);
  }
  return out;
}

/** What stays loaded as a run of `chapter` starts: its own, and the next chapter's, which the lobby fetches ahead. */
export function piecesKept(chapter: number): Set<ChapterPiece> {
  return new Set([...piecesFor(chapter), ...piecesFor(Math.min(chapter + 1, BALANCE.chapters))]);
}
