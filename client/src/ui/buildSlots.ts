import { EVOLVE_PAIR, MAX_LEVEL, MAX_PASSIVES, MAX_SPELLS, type PassiveId, type Player, type RelicId, type SpellId } from '@hk/engine';

// The build strip on the HUD (docs/content.md "Portrait readability": 9 icons at most): the
// relic, then the spell slots, then the passive slots, empty ones included so the player sees
// what is still open. A maxed item that waits for its paired passive names it, so the player
// knows which card completes the evolution. Pure, so it is tested without Pixi.

export type IconId = RelicId | SpellId | PassiveId;

/** `ready`: the evolution comes on the next level-up. `evolved` also means awakened. */
export type SlotState = 'empty' | 'normal' | 'ready' | 'evolved';

export interface BuildSlot {
  kind: 'relic' | 'spell' | 'passive';
  icon: IconId | null;
  level: number;
  state: SlotState;
  /** The passive this maxed item still needs to evolve. */
  needs: PassiveId | null;
}

function has(p: Player, id: PassiveId): boolean {
  return p.passives.some((s) => s.id === id);
}

function evolving(p: Player, id: RelicId | SpellId, level: number, done: boolean): Pick<BuildSlot, 'state' | 'needs'> {
  if (done) return { state: 'evolved', needs: null };
  if (level < MAX_LEVEL) return { state: 'normal', needs: null };
  const pair = EVOLVE_PAIR[id];
  return has(p, pair) ? { state: 'ready', needs: null } : { state: 'normal', needs: pair };
}

export function buildSlots(p: Player): BuildSlot[] {
  const empty = (kind: BuildSlot['kind']): BuildSlot => ({ kind, icon: null, level: 0, state: 'empty', needs: null });
  const slots: BuildSlot[] = [{ kind: 'relic', icon: p.relicId, level: p.relic, ...evolving(p, p.relicId, p.relic, p.awakened) }];
  for (let i = 0; i < MAX_SPELLS; i++) {
    const sp = p.spells[i];
    slots.push(sp ? { kind: 'spell', icon: sp.id, level: sp.level, ...evolving(p, sp.id, sp.level, sp.evolved) } : empty('spell'));
  }
  for (let i = 0; i < MAX_PASSIVES; i++) {
    const ps = p.passives[i];
    slots.push(ps ? { kind: 'passive', icon: ps.id, level: ps.level, state: 'normal', needs: null } : empty('passive'));
  }
  return slots;
}

/** A key that changes whenever the strip would look different, so it is redrawn only then. */
export function buildKey(slots: readonly BuildSlot[]): string {
  return slots.map((s) => `${s.icon ?? '-'}${s.level}${s.state[0]}${s.needs ?? ''}`).join('|');
}

/** The items a card's item pairs with for an evolution: a spell's passive, or a passive's owned partners. */
export function pairsOf(p: Player, id: IconId): IconId[] {
  if (id in EVOLVE_PAIR) return [EVOLVE_PAIR[id as RelicId | SpellId]];
  const out: IconId[] = [];
  if (EVOLVE_PAIR[p.relicId] === id && !p.awakened) out.push(p.relicId);
  for (const sp of p.spells) if (EVOLVE_PAIR[sp.id] === id && !sp.evolved) out.push(sp.id);
  return out;
}
