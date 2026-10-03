import { EVOLVE_PAIR, RELIC_IDS, SUTRA_IDS, type PassiveId, type Player, type RelicId, type SpellId, type SutraId } from '@hk/engine';

// The Codex (docs/content.md "Evolution"): every evolution and awakening the player has
// pulled off at least once. The save keeps their ids; a run reports what it evolved and the
// first ones are recorded when it is settled. Pure, so it is tested without Pixi.

export type EvolveId = SpellId | RelicId;

/** Every entry in Codex order: the relics' awakenings, then the spells' evolutions. */
export const EVOLVE_IDS = Object.keys(EVOLVE_PAIR) as EvolveId[];

export interface CodexEntry {
  id: EvolveId;
  found: boolean;
  /** The passive it evolves with. */
  pair: PassiveId;
  relic: boolean;
  /** The sutra the spell still waits for (it is not in the run's pool yet), or null. */
  sutra: SutraId | null;
}

/** What this player has evolved or awakened so far in the run. */
export function evolvedIn(p: Player): EvolveId[] {
  const out: EvolveId[] = p.awakened ? [p.relicId] : [];
  for (const sp of p.spells) if (sp.evolved) out.push(sp.id);
  return out;
}

/** `known` plus `more`, unknown ids dropped, in Codex order. */
export function mergeCodex(known: readonly unknown[], more: readonly unknown[] = []): EvolveId[] {
  return EVOLVE_IDS.filter((id) => known.includes(id) || more.includes(id));
}

/** Every entry; `sutras` are the ones the player has earned. */
export function codexEntries(found: readonly EvolveId[], sutras: readonly SutraId[] = SUTRA_IDS): CodexEntry[] {
  return EVOLVE_IDS.map((id) => ({
    id, found: found.includes(id), pair: EVOLVE_PAIR[id], relic: RELIC_IDS.includes(id as RelicId),
    sutra: SUTRA_IDS.includes(id as SutraId) && !sutras.includes(id as SutraId) ? (id as SutraId) : null,
  }));
}
