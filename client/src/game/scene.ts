// Prototype scene switches, read from the web page's query string (?mobs=300&ground=grass
// &hero=top|overfx|sort&ring=1&elite=1, plus types/page/mobres for the mob-type stress test) so readability variants can be compared side by side. WeChat and a
// bare URL get the defaults.

import { MONK_IDS, RELIC_IDS, SPELL_KINDS, type MonkId, type RelicId, type SpellKind } from '@hk/engine';
import type { RingMode } from './spells';
import { QUALITY_MODES, type QualityMode } from './quality';
import { GEM_PALETTES, type GemPalette } from './dropView';
import { CRIT_LOOKS, type CritLook } from './damage';
import { BULLET_LOOKS, type BulletLook, type ZoneLayer, type ZoneLook } from './threatView';

export type GroundKind = 'earth' | 'earth_soft' | 'grass' | 'flat';
export const GROUNDS: readonly GroundKind[] = ['earth', 'earth_soft', 'grass', 'flat'];

export interface SceneOptions {
  mobs: number;
  ground: GroundKind;
  /** Draw the hero above every mob instead of sorting him by depth. */
  heroOnTop: boolean;
  /** A warm ring on the ground under the hero. */
  ring: boolean;
  /** Draw the hero above the hit sparks and death puffs too (numbers stay on top). */
  heroOverFx: boolean;
  /** A ring under elites, and elites drawn over the horde. */
  eliteRing: boolean;
  /** Fake mob types: the horde cycles through this many hue-shifted copies of the jiangshi. */
  types: number;
  /** Atlas page size the fake types are packed into; 0 gives each type its own texture. */
  page: number;
  /** Resolution of the fake types relative to the baked sheet. */
  mobRes: number;
  /** Area spells cast round-robin around the hero (stress test), and casts per second. */
  spells: SpellKind[];
  rate: number;
  /** Buff layers stacked on the hero, each a halo and two orbs with trails. */
  stack: number;
  ringFx: RingMode;
  /** A blur filter on the effect layer, to measure what a filter costs. */
  blur: boolean;
  /** Effect fill budget in screens (1080x1920 world units); 0 follows the quality level. */
  fxBudget: number;
  /** Render quality forced by ?quality=auto|high|saver; null follows the settings panel. */
  quality: QualityMode | null;
  /** Experience gem colours, for the readability comparison. */
  gem: GemPalette;
  /** Gems scattered around the start (stress test). */
  drops: number;
  /** Enemy attacks for the readability test: bullets and blast zones, and their looks. */
  threats: boolean;
  bullet: BulletLook;
  zone: ZoneLook;
  zoneLayer: ZoneLayer;
  /** Readability of the hero among numbers, spells and elites: crit colour, numbers fading
   * over the hero, a dark backing behind him, the elite ring colour and the fox tint. */
  crit: CritLook;
  numFade: boolean;
  heroBack: boolean;
  eliteColor: EliteColor;
  foxTint: boolean;
  /** Ground decorations against the tile repeat: none, faint patches only, or patches and props. */
  deco: DecoMode;
  /** A stage's low mist (chapter 2's marsh); off to compare the bare ground. */
  mist: boolean;
  /** Smooth eases the hero's starts and stops and the camera after him; lock is the old hard follow. */
  cam: 'smooth' | 'lock';
  /** Mobs jammed in the crowd land and stand instead of hopping in place. */
  settle: boolean;
  /** Mobs blocked by a neighbour ahead wait instead of pressing on, so a jam stands still. */
  queue: boolean;
  /** The crowd behind the front ring dims with distance, and mobs vary a little in size and tone. */
  calm: boolean;
  /** Mobs closer than this push apart (world units; a mob is 80 tall). */
  sep: number;
  /** Near-white faces and talismans toned down (tools/soften_mob.py), or the plain sheet. */
  softFace: boolean;
  /** Mobs standing in a jam breathe a little instead of freezing. */
  sway: boolean;
  /** The fallen-abbot boss (cutout rig, telegraphed slam, health bar), and its height in world units. */
  boss: boolean;
  bossSize: number;
  /** Simulation seed, for reproducing a run; 0 picks a random one. */
  seed: number;
  /**
   * Play the chapter's waves (growing horde, elites, bosses, death). Off is the sandbox for
   * stress tests (a fixed horde of `mobs`, no death): ?waves=0, and the default once ?mobs= is set.
   */
  waves: boolean;
  /** Dev: a chapter run starts at the end of the wave before this one (?wave=25 for the mid-boss). */
  wave: number;
  /** Dev: a run started with ?direct plays this chapter (?chapter=2); 0 keeps the save's. */
  chapter: number;
  /** Dev: the relic for every run, whatever the save says (?relic=staff); null keeps the save's. */
  relic: RelicId | null;
  /** Dev: every sutra for every run, whatever the save has earned (?sutras). */
  sutras: boolean;
  /** Dev: no stats from gear and training, to compare with a fresh account (?bare). */
  bare: boolean;
  /** Dev: the run plays hard mode whatever the lobby shows (?hard). */
  hard: boolean;
  /** Dev: the monk for every run, whatever the save says (?monk=fat); null keeps the save's. */
  monk: MonkId | null;
  /** Dev: the balance bot plays (?autoplay), for videos and soak tests. */
  autoplay: boolean;
  /** Dev: records this many seconds of the first run to a video file (?record=20); 0 off. */
  record: number;
}

export type DecoMode = 'none' | 'patches' | 'props';
export const DECO_MODES: readonly DecoMode[] = ['none', 'patches', 'props'];

export type EliteColor = 'red' | 'white' | 'violet';
export const ELITE_COLORS: readonly EliteColor[] = ['red', 'white', 'violet'];

// Defaults picked from the 300-mob readability comparisons (2026-10-01), checked under a
// simulated red-blind view too: a red elite ring vanished on grass, gold crits matched the hero.
export const DEFAULT_SCENE: SceneOptions = {
  mobs: 40, ground: 'grass', heroOnTop: true, ring: true, heroOverFx: true, eliteRing: true,
  types: 1, page: 0, mobRes: 1,
  spells: [], rate: 1, stack: 0, ringFx: 'band', blur: false, fxBudget: 0, quality: null,
  gem: 'pink', drops: 0,
  threats: false, bullet: 'violet', zone: 'fill', zoneLayer: 'top',
  crit: 'orange', numFade: true, heroBack: true, eliteColor: 'white', foxTint: true,
  deco: 'props',
  mist: true,
  cam: 'smooth',
  settle: true,
  queue: true,
  calm: true,
  sep: 75,
  softFace: true,
  sway: true,
  boss: true,
  bossSize: 300,
  seed: 0,
  waves: true,
  wave: 1,
  chapter: 0,
  relic: null,
  sutras: false,
  bare: false,
  hard: false,
  monk: null,
  autoplay: false,
  record: 0,
};

export function parseScene(query: string): SceneOptions {
  const q = new URLSearchParams(query);
  const mobs = Number(q.get('mobs'));
  const ground = q.get('ground') as GroundKind;
  const mobsSet = Number.isInteger(mobs) && mobs > 0;
  return {
    mobs: mobsSet ? Math.min(mobs, 2000) : DEFAULT_SCENE.mobs,
    ground: GROUNDS.includes(ground) ? ground : DEFAULT_SCENE.ground,
    heroOnTop: q.has('hero') ? q.get('hero') !== 'sort' : DEFAULT_SCENE.heroOnTop,
    heroOverFx: q.has('hero') ? q.get('hero') === 'overfx' : DEFAULT_SCENE.heroOverFx,
    eliteRing: q.has('elite') ? q.get('elite') === '1' : DEFAULT_SCENE.eliteRing,
    ring: q.has('ring') ? q.get('ring') === '1' : DEFAULT_SCENE.ring,
    types: Math.min(64, intAtLeast(q.get('types'), 1, DEFAULT_SCENE.types)),
    page: [1024, 2048, 4096].includes(Number(q.get('page'))) ? Number(q.get('page')) : DEFAULT_SCENE.page,
    spells: (q.get('spells') ?? '').split(',').filter((k): k is SpellKind => SPELL_KINDS.includes(k as SpellKind)),
    rate: num(q.get('rate'), 0.1, 20, DEFAULT_SCENE.rate),
    stack: Math.round(num(q.get('stack'), 0, 30, DEFAULT_SCENE.stack)),
    ringFx: q.get('ringfx') === 'quad' ? 'quad' : DEFAULT_SCENE.ringFx,
    blur: q.has('blur') ? q.get('blur') === '1' : DEFAULT_SCENE.blur,
    fxBudget: num(q.get('fxbudget'), 0, 50, DEFAULT_SCENE.fxBudget),
    quality: QUALITY_MODES.includes(q.get('quality') as QualityMode) ? (q.get('quality') as QualityMode) : DEFAULT_SCENE.quality,
    mobRes: num(q.get('mobres'), 0.25, 1, DEFAULT_SCENE.mobRes),
    gem: GEM_PALETTES.includes(q.get('gem') as GemPalette) ? (q.get('gem') as GemPalette) : DEFAULT_SCENE.gem,
    drops: Math.round(num(q.get('drops'), 0, 20000, DEFAULT_SCENE.drops)),
    threats: q.has('threats') ? q.get('threats') === '1' : DEFAULT_SCENE.threats,
    bullet: BULLET_LOOKS.includes(q.get('bullet') as BulletLook) ? (q.get('bullet') as BulletLook) : DEFAULT_SCENE.bullet,
    zone: q.get('zone') === 'edge' ? 'edge' : DEFAULT_SCENE.zone,
    zoneLayer: (['under', 'over', 'top'] as const).find((z) => z === q.get('zonez')) ?? DEFAULT_SCENE.zoneLayer,
    crit: CRIT_LOOKS.find((c) => c === q.get('crit')) ?? DEFAULT_SCENE.crit,
    numFade: q.has('numfade') ? q.get('numfade') === '1' : DEFAULT_SCENE.numFade,
    heroBack: q.has('heroback') ? q.get('heroback') === '1' : DEFAULT_SCENE.heroBack,
    eliteColor: ELITE_COLORS.find((c) => c === q.get('elitecolor')) ?? DEFAULT_SCENE.eliteColor,
    foxTint: q.has('foxtint') ? q.get('foxtint') === '1' : DEFAULT_SCENE.foxTint,
    deco: DECO_MODES.find((d) => d === q.get('deco')) ?? DEFAULT_SCENE.deco,
    mist: q.has('mist') ? q.get('mist') === '1' : DEFAULT_SCENE.mist,
    cam: q.get('cam') === 'lock' ? 'lock' : DEFAULT_SCENE.cam,
    settle: q.has('settle') ? q.get('settle') === '1' : DEFAULT_SCENE.settle,
    queue: q.has('queue') ? q.get('queue') === '1' : DEFAULT_SCENE.queue,
    calm: q.has('calm') ? q.get('calm') === '1' : DEFAULT_SCENE.calm,
    sep: num(q.get('sep'), 30, 120, DEFAULT_SCENE.sep),
    softFace: q.has('face') ? q.get('face') !== 'white' : DEFAULT_SCENE.softFace,
    sway: q.has('sway') ? q.get('sway') === '1' : DEFAULT_SCENE.sway,
    boss: q.has('boss') ? q.get('boss') === '1' : DEFAULT_SCENE.boss,
    bossSize: num(q.get('bosssize'), 130, 600, DEFAULT_SCENE.bossSize),
    seed: intAtLeast(q.get('seed'), 1, DEFAULT_SCENE.seed),
    waves: q.has('waves') ? q.get('waves') === '1' : !mobsSet && DEFAULT_SCENE.waves,
    wave: Math.min(50, intAtLeast(q.get('wave'), 1, DEFAULT_SCENE.wave)),
    chapter: Math.min(5, intAtLeast(q.get('chapter'), 1, DEFAULT_SCENE.chapter)),
    relic: RELIC_IDS.find((r) => r === q.get('relic')) ?? DEFAULT_SCENE.relic,
    sutras: q.has('sutras'),
    bare: q.has('bare'),
    hard: q.has('hard'),
    monk: MONK_IDS.find((m) => m === q.get('monk')) ?? DEFAULT_SCENE.monk,
    autoplay: q.has('autoplay'),
    record: num(q.get('record'), 1, 120, DEFAULT_SCENE.record),
  };
}

function intAtLeast(v: string | null, min: number, fallback: number): number {
  const n = Number(v);
  return v !== null && Number.isInteger(n) && n >= min ? n : fallback;
}

/** A number within [min, max], or the fallback. */
function num(v: string | null, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return v !== null && v !== '' && n >= min && n <= max ? n : fallback;
}
