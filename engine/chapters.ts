// The chapter ladder (docs/design.md "Twenty chapters"): CHAPTERS chapters on MAPS maps, the maps
// in turn (chapter c plays map mapOf(c)), each round of the maps an act. A chapter's content (who
// joins the horde, its packs, elites and boss, the map's own rules) comes from its map; its
// difficulty from its own place on the ladder. Re-exported by config.ts.

export const CHAPTERS = 20;
export const MAPS = 5;

/** The map chapter `chapter` plays: 1–5, then round again. */
export function mapOf(chapter: number): number {
  return ((Math.max(chapter, 1) - 1) % MAPS) + 1;
}

/** The act chapter `chapter` belongs to: 1 for chapters 1–5, 2 for 6–10, and so on. */
export function actOf(chapter: number): number {
  return Math.trunc((Math.max(chapter, 1) - 1) / MAPS) + 1;
}

/**
 * Each chapter's difficulty, percent: mob health (hp), every hurt (hurt) and elite and boss
 * health (foe). Mob health grows x33 over the ladder, geometric, hurt to x2 and foes to x2.7
 * with it (as hp^(ln 3/ln 200) and hp^(ln 4.5/ln 200)); the temple map, about 1.6x easier
 * than the others for the same gear (balance bots, 2026-10-21), takes x1.6 on chapters 6, 11
 * and 16. The meta game (gear tiers, training) keeps a hero growing into the last chapters
 * (`npm run journey`: a casual player clears all 20 around day 30).
 */
export const LADDER = {
  hp: [100, 120, 144, 174, 209, 402, 302, 363, 436, 524, 1008, 757, 910, 1094, 1315, 2529, 1900, 2284, 2745, 3300],
  hurt: [100, 104, 108, 112, 116, 133, 126, 131, 136, 141, 161, 152, 158, 164, 171, 195, 184, 191, 199, 206],
  foe: [100, 105, 111, 117, 123, 148, 137, 144, 152, 160, 193, 178, 187, 197, 208, 250, 231, 243, 256, 270],
};

/**
 * Hard mode (docs/design.md "Hard mode"), a chapter's advanced play, open once its normal mode is
 * cleared with three stars: the chapter's LADDER percents times these, and every elite wave
 * brings one elite more. Its waves never wait on kills (PACE).
 */
export const HARD = {
  hp: 250,
  hurt: 122,
  foe: 130,
};

/**
 * A chapter's extra mob health and hurt (over 100 %, LADDER) come in over the run: `from`
 * percent of the extra on wave 1, rising to `to` percent on wave `wave` and after. The hero
 * starts every run at level 1, so a flat step makes the first waves the wall and the rest of
 * the run a formality.
 */
export const CHAPTER_RAMP = {
  from: 0,
  to: 180,
  wave: 50,
};

/** `pct` percent (a chapter's LADDER hp or hurt) ramped in for wave `wave` (CHAPTER_RAMP). */
export function rampChapter(pct: number, wave: number): number {
  const span = CHAPTER_RAMP.wave - 1;
  const n = Math.min(Math.max(wave - 1, 0), span);
  const share = CHAPTER_RAMP.from + Math.trunc(((CHAPTER_RAMP.to - CHAPTER_RAMP.from) * n) / span);
  return 100 + Math.trunc(((pct - 100) * share) / 100);
}

/** Chapter `chapter`'s LADDER percent of `table`, times `hardPct` in hard mode. */
export function ladder(table: readonly number[], chapter: number, hard: boolean, hardPct: number): number {
  const pct = table[Math.min(Math.max(chapter, 1), table.length) - 1];
  return hard ? Math.trunc((pct * hardPct) / 100) : pct;
}
