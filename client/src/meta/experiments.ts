import { EXP_NAME, expTag, type Host } from '@hk/protocol';
import { BALANCE } from './balance';
import table from './experiments.json';
import type { SaveData } from './save';

// A/B experiments (docs/experiments.md): the table in experiments.json names each one's arms with
// their weights and the hosts it runs on. A save is put in an arm once, the first time it loads
// while an experiment runs on its host, by the device's own random; only a save whose first run
// is still to come is enrolled, an older player is kept as not enrolled (''). The arm stays in the
// save (through cloud merges) and tags every event batch (`exp`), so the dashboard splits by it.

export interface Experiment {
  /** What it tests and what its arms do, for whoever reads the table. */
  note: string;
  /** The hosts it enrolls new players on; none: it enrolls nobody (a dev ?arm= still can). */
  hosts: Host[];
  /** Each arm's weight, whole numbers: { control: 1, short: 1 } is half and half. */
  arms: Record<string, number>;
}

export type Experiments = Record<string, Experiment>;

export const EXPERIMENTS: Experiments = table as Experiments;

/** `arms` weighted, picked by `random()` in [0, 1); '' when no arm has a weight. */
export function pickArm(arms: Record<string, number>, random: () => number): string {
  const list = Object.entries(arms).filter(([arm, w]) => EXP_NAME.test(arm) && Number.isInteger(w) && w > 0);
  const total = list.reduce((s, [, w]) => s + w, 0);
  let roll = Math.floor(random() * total);
  for (const [arm, w] of list) {
    if (roll < w) return arm;
    roll -= w;
  }
  return '';
}

/** A dev `?arm=first20:short` as experiment id → arm; anything malformed is skipped. */
export function forcedArms(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of query.split(',')) {
    const [id, arm] = pair.split(':');
    if (id && arm !== undefined && EXP_NAME.test(id) && EXP_NAME.test(arm)) out[id] = arm;
  }
  return out;
}

/**
 * `save` with an arm (or '' for not enrolled) for every experiment in `table` running on `host`
 * that it has none for yet; `forced` (a dev ?arm=) wins over everything. The same object when
 * nothing changed.
 */
export function enroll(save: SaveData, host: Host, random: () => number, table: Experiments = EXPERIMENTS, forced: Record<string, string> = {}): SaveData {
  const arms = { ...save.arms };
  let changed = false;
  for (const [id, x] of Object.entries(table)) {
    if (!EXP_NAME.test(id)) continue;
    let arm: string | undefined = forced[id];
    if (arm === undefined) {
      if (id in arms || !x.hosts.includes(host)) continue;
      arm = save.firstRunDone || save.runs > 0 ? '' : pickArm(x.arms, random);
    }
    if (arms[id] === arm) continue;
    arms[id] = arm;
    changed = true;
  }
  return changed ? { ...save, arms } : save;
}

/** The arm `save` plays in experiment `id`, '' when not enrolled or the experiment is gone from the table. */
export function armOf(save: SaveData, id: string, table: Experiments = EXPERIMENTS): string {
  return id in table ? save.arms[id] ?? '' : '';
}

/** The `exp` tag for the event batches: the arms of the experiments still in the table. */
export function experimentTag(save: SaveData, table: Experiments = EXPERIMENTS): string {
  return expTag(Object.fromEntries(Object.entries(save.arms).filter(([id]) => id in table)));
}

/**
 * The waves of a chapter run: the full chapter. This is the hook for the `first20` experiment's
 * `short` arm (a first run of 20 waves, docs/retention.md "A shorter first run"), which is not
 * built: what a 20-wave win unlocks is the owner's call, and until then every arm plays the full
 * chapter. A shorter run is never a clear and never goes on a board (runFlow.ts settle).
 */
export function runWaves(_save: SaveData): number {
  return BALANCE.waves;
}
