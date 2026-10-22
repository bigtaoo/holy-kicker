import { MONK_IDS, RELIC_IDS, SUTRA_IDS, type MonkId, type RelicId, type Stat, type SutraId } from '@hk/engine';
import { BALANCE, type Blessing, type SutraGoal } from './balance';
import { bestTier, grantRelics, TIERS } from './gear';
import type { SaveData } from './save';

// When each unlockable opens over the twenty chapters (docs/unlocks.md): relics, sutras and
// monks by chapter cleared, gear tiers by the chapter they first drop in, and star blessings by
// the normal chapters' star total. Pure: reads a save, never writes one except `keepUnlocks`.

export type Unlock =
  | { kind: 'relic'; id: RelicId }
  | { kind: 'sutra'; id: SutraId }
  | { kind: 'monk'; id: MonkId }
  | { kind: 'tier'; tier: number }
  | { kind: 'blessing'; stat: Stat; n: number };

/** The chapter to clear for relic `id` (0 for the cuju). */
export function relicChapter(id: RelicId): number {
  return BALANCE.unlocks.relics[RELIC_IDS.indexOf(id)];
}

/** Relics the player may take into a run: those whose chapter is cleared, and any already owned. */
export function unlockedRelics(save: SaveData): RelicId[] {
  return RELIC_IDS.filter((r) => save.cleared >= relicChapter(r) || bestTier(save.gear, r) >= 0);
}

/** The chapter to clear before monk `id` can be bought. */
export function monkChapter(id: MonkId): number {
  return BALANCE.unlocks.monks[id];
}

/** Whether monk `id` can be bought (or is owned already). */
export function monkOpen(save: SaveData, id: MonkId): boolean {
  return (save.monks & (1 << MONK_IDS.indexOf(id))) !== 0 || save.cleared >= monkChapter(id);
}

/** The achievement that grants a sutra. */
export function sutraGoal(id: SutraId): SutraGoal {
  return BALANCE.sutras[SUTRA_IDS.indexOf(id)];
}

/** Whether the save has reached a sutra's goal. */
function reached(save: SaveData, goal: SutraGoal): boolean {
  if (goal.kind === 'wave') return save.best.some((b) => b >= goal.n);
  if (goal.kind === 'codex') return save.codex.length >= goal.n;
  if (goal.kind === 'runs') return save.runs >= goal.n;
  return save.cleared >= goal.n;
}

/**
 * Sutras the player has earned (docs/design.md "Content line"): each adds a spell or a passive
 * to the run's level-up pool. Those stored in `save.sutras` and those whose goal the progress has
 * reached, so a sutra is never lost when its goal moves.
 */
export function earnedSutras(save: SaveData): SutraId[] {
  return SUTRA_IDS.filter((id, i) => (save.sutras & (1 << i)) !== 0 || reached(save, sutraGoal(id)));
}

export function sutraBits(ids: readonly SutraId[]): number {
  return ids.reduce((bits, id) => bits | (1 << SUTRA_IDS.indexOf(id)), 0);
}

/** The sutra goals before the re-paced schedule (2026-10-22), in SUTRA_IDS order: Halo Beam came with the first Codex entry. */
const OLD_SUTRAS: readonly SutraGoal[] = [
  { kind: 'wave', n: 25 },
  { kind: 'codex', n: 1 },
  { kind: 'clear', n: 2 },
  { kind: 'runs', n: 10 },
];

/**
 * A loaded save's unlocks kept whole. A save from before the re-paced schedule (`legacy`: no
 * stored sutras yet) keeps every relic and sutra the old gates gave; every unlocked relic has
 * its copy in the gear, and the worn relic (`relic`, as stored) is one of the unlocked ones.
 */
export function keepUnlocks(save: SaveData, relic: unknown, legacy: boolean): SaveData {
  const due = RELIC_IDS.filter((r, i) => save.cleared >= relicChapter(r) || (legacy && i <= save.cleared));
  const old = legacy ? sutraBits(SUTRA_IDS.filter((_, i) => reached(save, OLD_SUTRAS[i]))) : 0;
  const next = { ...save, gear: grantRelics(save.gear, due), sutras: save.sutras | old };
  return { ...next, relic: unlockedRelics(next).includes(relic as RelicId) ? (relic as RelicId) : 'ball' };
}

/** The chapter gear tier `tier` first drops in (BALANCE.gear.dropTiers), or 0 when it never does. */
export function tierChapter(tier: number): number {
  return BALANCE.gear.dropTiers.findIndex((row) => row[tier] > 0) + 1;
}

/** The normal chapters' stars added up: what the blessings count. */
export function starTotal(save: SaveData): number {
  return save.stars.reduce((sum, s) => sum + s, 0);
}

/** What the reached star blessings add to every run. */
export function blessingBonus(save: SaveData): Partial<Record<Stat, number>> {
  const total = starTotal(save);
  const out: Partial<Record<Stat, number>> = {};
  for (const b of BALANCE.blessings) if (total >= b.stars) out[b.stat] = (out[b.stat] ?? 0) + b.n;
  return out;
}

/** The next blessing the stars have not reached, or null once all are. */
export function nextBlessing(save: SaveData): Blessing | null {
  const total = starTotal(save);
  return BALANCE.blessings.find((b) => b.stars > total) ?? null;
}

/** What a first clear of chapter `chapter` opens: relics, sutras, monks to buy, and the gear tier its next chapter starts dropping. */
export function clearUnlocks(chapter: number): Unlock[] {
  const out: Unlock[] = [];
  for (const id of RELIC_IDS) if (relicChapter(id) === chapter) out.push({ kind: 'relic', id });
  for (const id of SUTRA_IDS) {
    const goal = sutraGoal(id);
    if (goal.kind === 'clear' && goal.n === chapter) out.push({ kind: 'sutra', id });
  }
  for (const id of MONK_IDS) if (monkChapter(id) === chapter && chapter > 0) out.push({ kind: 'monk', id });
  for (let tier = 1; tier < TIERS; tier++) if (tierChapter(tier) === chapter + 1) out.push({ kind: 'tier', tier });
  return out;
}

/** What `after` has unlocked that `before` had not, in the order the results show them. */
export function newUnlocks(before: SaveData, after: SaveData): Unlock[] {
  const out: Unlock[] = [];
  const relics = unlockedRelics(before);
  for (const id of unlockedRelics(after)) if (!relics.includes(id)) out.push({ kind: 'relic', id });
  const sutras = earnedSutras(before);
  for (const id of earnedSutras(after)) if (!sutras.includes(id)) out.push({ kind: 'sutra', id });
  for (const id of MONK_IDS) if (monkOpen(after, id) && !monkOpen(before, id)) out.push({ kind: 'monk', id });
  for (let tier = 1; tier < TIERS; tier++) {
    const c = tierChapter(tier);
    if (c > before.cleared + 1 && c <= after.cleared + 1) out.push({ kind: 'tier', tier });
  }
  const [was, now] = [starTotal(before), starTotal(after)];
  for (const b of BALANCE.blessings) if (b.stars > was && b.stars <= now) out.push({ kind: 'blessing', stat: b.stat, n: b.n });
  return out;
}
