import { LIMITS } from '@hk/protocol';
import { takeReplay, type LocalInputSource } from '@hk/engine';
import { t } from '../i18n';
import type { Game } from '../game/Game';
import type { SceneOptions } from '../game/scene';
import type { Platform } from '../platform/types';
import type { Backend, ReportDraft } from '../net/backend';
import type { ReportOutcome } from './RunHud';

// "Report a problem" on the pause panel: the host's text box for the player's note, then the
// note, the device and a replay of the run so far (engine/replay.ts) to the backend. Offline in
// development the report is saved as a JSON file instead, so the flow can be tried locally.

/** What a report is made from: the run, and what the scene bent (a dev ?wave= start). */
export function draftReport(game: Game, scene: SceneOptions, text: string, device: string): ReportDraft {
  const s = game.engine.state;
  const history = (game.engine.input as LocalInputSource).history;
  const startWave = s.config.waves > 0 && scene.wave > 1 ? Math.min(scene.wave, s.config.waves) : 1;
  const replay = takeReplay(game.engine, history, startWave);
  // a run too long for the wire still sends its note
  const fits = replay.cmds.length <= LIMITS.replayNumbers;
  return {
    text, device, chapter: s.config.chapter, wave: s.wave,
    replay: fits ? { ...replay, config: { ...replay.config } } : null,
  };
}

/** Asks, then sends; `game` is read after the text box closes (the run stays paused meanwhile). */
export async function reportProblem(platform: Platform, net: Backend, game: () => Game | null, scene: SceneOptions): Promise<ReportOutcome> {
  const text = await platform.askText({
    title: t('report.title'), prompt: t('report.prompt'), placeholder: t('report.placeholder'),
    send: t('report.send'), cancel: t('report.cancel'), max: LIMITS.reportText,
  });
  const run = game();
  if (text === null || !run) return 'cancelled';
  const draft = draftReport(run, scene, text, platform.device());
  if (net.online) return (await net.report(draft)) ? 'sent' : 'failed';
  saveFile(`report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(draft));
  return 'sent';
}

/** Whether the pause panel offers a report: online, or in development (saved to a file). */
export function canReport(net: Backend, dev: boolean): boolean {
  return net.online || (dev && typeof document !== 'undefined');
}

function saveFile(name: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
