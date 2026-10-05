import type { SimEvent } from '@hk/engine';
import type { Cue } from '../audio/cues';

// Which sound a sim event makes, if any. Another player's own actions (kicks, hurts, level-ups)
// are silent, so a future online match does not play everyone's feedback on every screen.

const SPELL_CUES = { nova: 'nova', meteor: 'meteor', field: 'field', chain: 'zap' } as const;

export function eventCue(e: SimEvent, local: number): Cue | null {
  switch (e.type) {
    case 'kick':
      return e.owner === local ? 'kick' : null;
    case 'sweep':
      return e.owner === local ? 'swish' : null;
    case 'ring':
      return e.owner === local ? 'woodfish' : null;
    case 'hurt':
      return e.owner === local && e.value > 0 ? 'hurt' : null;
    case 'heroDown':
      return e.owner === local ? 'heroDown' : null;
    case 'revive':
      return e.owner === local ? 'revive' : null;
    case 'hit':
      return e.crit ? 'crit' : e.ball ? 'thump' : 'hit';
    case 'mobDown':
      return 'pop';
    case 'eliteDown':
      return 'eliteDown';
    case 'block':
      return 'clang';
    case 'emerge':
    case 'bossDive':
      return 'splash';
    case 'howl':
      return 'howl';
    case 'summon':
      return 'summon';
    case 'bossCast':
      return 'bossCast';
    case 'bossWindup':
      return 'windup';
    case 'bossSlam':
      return 'slam';
    case 'bossDown':
      return 'bossDown';
    case 'bossBack':
      return 'splash';
    case 'blast':
      return 'blast';
    case 'pickup':
      return e.owner === local ? 'gem' : null;
    case 'cast':
      return SPELL_CUES[e.kind];
    case 'bolt':
      return 'zap';
    case 'bloom':
      return 'bloom';
    case 'roar':
      return 'roar';
    case 'bounce':
      return 'thump';
    case 'dodge':
      return e.owner === local ? 'swish' : null;
    case 'bellUp':
      return e.owner === local ? 'bell' : null;
    case 'bellBreak':
      return e.owner === local ? 'bellBreak' : null;
    case 'levelUp':
      return e.owner === local ? 'levelUp' : null;
    case 'pick':
      return e.owner === local ? 'pick' : null;
    case 'wave':
      return 'wave';
    case 'cleared':
      return 'cleared';
  }
}
