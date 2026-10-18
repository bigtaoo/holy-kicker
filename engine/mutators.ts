import type { StatBonus } from './content';

// Challenge mutators (RunConfig.mutator, docs/design.md "Challenges"): one rule of the run bent
// the same way for everyone who plays that challenge. The server picks one per challenge.

export type MutatorId = 'elites' | 'swift' | 'glass';
export const MUTATOR_IDS: readonly MutatorId[] = ['elites', 'swift', 'glass'];

export const MUTATORS = {
  /** Elite-heavy: every elite wave brings this many more of its first elite. */
  elites: { more: 1 },
  /** A faster horde: mobs walk at this percent of their speed (elites and bosses as before). */
  swift: { speedPercent: 125 },
  /** A fragile hero: these stat points on top of gear and the monk's (half the base health, double XP). */
  glass: { bonus: { maxHp: -50, xp: 100 } as StatBonus },
};

/** A known mutator id, or null (an unknown one from a newer server plays as none). */
export function mutatorOf(id: string | null | undefined): MutatorId | null {
  return MUTATOR_IDS.includes(id as MutatorId) ? (id as MutatorId) : null;
}

/** The hero's stat bonus `bonus` with the mutator's points added. */
export function mutatorBonus(bonus: StatBonus, mutator: MutatorId | null | undefined): StatBonus {
  if (mutator !== 'glass') return bonus;
  const out: Record<string, number> = { ...bonus };
  for (const [k, v] of Object.entries(MUTATORS.glass.bonus)) out[k] = (out[k] ?? 0) + (v ?? 0);
  return out;
}

/** A mob's walking speed `v` under the mutator. */
export function mutatorSpeed(v: number, mutator: MutatorId | null | undefined): number {
  return mutator === 'swift' ? Math.trunc((v * MUTATORS.swift.speedPercent) / 100) : v;
}
