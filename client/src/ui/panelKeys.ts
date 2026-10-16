// The keyboard on the run's panels and the results, for desktop players: Enter or Space takes the
// main button (Play again, the revive, Resume), Escape the way back (Continue, give up, pause and
// resume), and P pauses and resumes too. Key repeats count for nothing, so a held key never
// clicks through two panels in a row. Pure, so it is tested without Pixi.

export type PanelKey = 'ok' | 'back' | 'pause' | null;

const OK = new Set(['Enter', 'NumpadEnter', 'Space']);

/** What key `code` means on a panel. */
export function panelKey(code: string, repeat: boolean): PanelKey {
  if (repeat) return null;
  if (OK.has(code)) return 'ok';
  if (code === 'Escape') return 'back';
  if (code === 'KeyP') return 'pause';
  return null;
}
