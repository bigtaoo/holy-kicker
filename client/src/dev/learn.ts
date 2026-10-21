import { MAX_LEVEL, SPELL_CAST, SPELL_IDS, type SimState, type SpellId } from '@hk/engine';

// Dev: ?learn=talisman,bomb:5,knives hands the local hero these spells (at level 1, or the
// level after the colon; 6 for the evolved form) before the first tick, to look at a spell
// without playing up to it. Not a ranked run (scene.ts rankedRun).

export function learnSpells(s: SimState, spec: string): void {
  const p = s.players[0];
  for (const part of spec.split(',')) {
    const [id, lv] = part.split(':');
    if (!SPELL_IDS.includes(id as SpellId) || p.spells.some((sp) => sp.id === id)) continue;
    const level = Math.max(1, Math.min(MAX_LEVEL + 1, Number(lv) || 1));
    p.spells.push({ id: id as SpellId, level: Math.min(level, MAX_LEVEL), cd: SPELL_CAST.first, evolved: level > MAX_LEVEL });
  }
}
