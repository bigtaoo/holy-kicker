import { t } from '../i18n';
import type { TrainStat } from '../meta/training';

// One line per stat for the gear and training tabs, in the passives' units: percent, except
// regen (per mille of max health per second, shown as a percent).

export function statText(stat: TrainStat, n: number): string {
  return t(`stat.${stat}`, { n: stat === 'regen' ? n / 10 : n });
}

/** Lines for a stat block, in a fixed order so the panels do not reshuffle. */
export function statLines(stats: Partial<Record<TrainStat, number>>): string[] {
  return STAT_ORDER.filter((s) => stats[s]).map((s) => statText(s, stats[s]!));
}

const STAT_ORDER: readonly TrainStat[] = [
  'attack', 'maxHp', 'crit', 'regen', 'speed', 'magnet', 'xp', 'cooldown', 'area', 'duration', 'guard', 'copper', 'revive',
];
