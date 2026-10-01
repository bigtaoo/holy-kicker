import data from './balance.json';

// Balance numbers live in balance.json, never in code, so they can move to remote config
// later (docs/design.md "Platforms, saves and server"). All values are starting points.

export interface Chest {
  wave: number;
  copper: number;
  jade: number;
}

export interface Balance {
  chapters: number;
  waves: number;
  waveSeconds: number;
  copperPerWave: number;
  copperChapterStep: number;
  chests: Chest[];
  xpPerWave: number;
  levelXpBase: number;
  levelXpStep: number;
  unlocks: { trainLevel: number; shopChapter: number; codexChapter: number };
}

export const BALANCE: Balance = data;
