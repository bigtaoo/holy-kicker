// The game's sound cues: a small closed set of ids, each with its mix. The view turns sim
// events (and UI taps) into cues; Sound decides whether and how loud each one plays.
//
// priority: who keeps a voice when the cap is full (higher steals from lower).
// gain: the cue's level on the effects bus, before coalescing; set for the recorded samples
//   (peak-normalised by tools/audio_build.py) where a cue has one, else for its synth voice.
// gap: seconds before the same cue may sound again; anything sooner is dropped, so a horde
//   dying at once is one pop, not two hundred.

export type Cue =
  // the hero and his relics
  | 'kick' | 'thump' | 'swish' | 'woodfish' | 'hurt' | 'heroDown' | 'revive'
  // hits and kills
  | 'hit' | 'crit' | 'pop' | 'eliteDown' | 'clang'
  // spells and sutras
  | 'nova' | 'meteor' | 'field' | 'zap' | 'bloom' | 'roar' | 'bell' | 'bellBreak'
  // enemies and bosses
  | 'splash' | 'howl' | 'summon' | 'bossCast' | 'windup' | 'slam' | 'bossDown' | 'blast'
  // the run
  | 'gem' | 'levelUp' | 'pick' | 'wave' | 'cleared'
  // screens
  | 'tap';

export interface CueDef {
  priority: number;
  gain: number;
  gap: number;
}

export const CUES: Record<Cue, CueDef> = {
  kick: { priority: 2, gain: 0.5, gap: 0.08 },
  thump: { priority: 1, gain: 0.45, gap: 0.06 },
  swish: { priority: 2, gain: 0.7, gap: 0.1 },
  woodfish: { priority: 2, gain: 0.3, gap: 0.1 },
  hurt: { priority: 4, gain: 0.3, gap: 0.25 },
  heroDown: { priority: 5, gain: 0.7, gap: 1 },
  revive: { priority: 5, gain: 0.6, gap: 1 },
  hit: { priority: 0, gain: 0.22, gap: 0.07 },
  crit: { priority: 1, gain: 0.3, gap: 0.12 },
  pop: { priority: 0, gain: 0.3, gap: 0.06 },
  eliteDown: { priority: 4, gain: 0.7, gap: 0.3 },
  clang: { priority: 2, gain: 0.4, gap: 0.15 },
  nova: { priority: 2, gain: 0.45, gap: 0.2 },
  meteor: { priority: 2, gain: 0.5, gap: 0.2 },
  field: { priority: 1, gain: 0.35, gap: 0.3 },
  zap: { priority: 1, gain: 0.3, gap: 0.12 },
  bloom: { priority: 1, gain: 0.3, gap: 0.15 },
  roar: { priority: 2, gain: 0.5, gap: 0.3 },
  bell: { priority: 2, gain: 0.4, gap: 0.5 },
  bellBreak: { priority: 3, gain: 0.5, gap: 0.3 },
  splash: { priority: 1, gain: 0.9, gap: 0.2 },
  howl: { priority: 3, gain: 0.45, gap: 0.8 },
  summon: { priority: 2, gain: 0.35, gap: 0.3 },
  bossCast: { priority: 3, gain: 0.45, gap: 0.3 },
  windup: { priority: 3, gain: 0.45, gap: 0.3 },
  slam: { priority: 4, gain: 0.7, gap: 0.3 },
  bossDown: { priority: 5, gain: 0.8, gap: 1 },
  blast: { priority: 1, gain: 0.35, gap: 0.12 },
  gem: { priority: 1, gain: 0.18, gap: 0.07 },
  levelUp: { priority: 5, gain: 0.55, gap: 0.5 },
  pick: { priority: 5, gain: 0.45, gap: 0.2 },
  wave: { priority: 3, gain: 0.9, gap: 1 },
  cleared: { priority: 6, gain: 0.7, gap: 2 },
  tap: { priority: 6, gain: 0.35, gap: 0.05 },
};
