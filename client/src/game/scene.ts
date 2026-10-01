// Prototype scene switches, read from the web page's query string (?mobs=300&ground=grass
// &hero=top|overfx|sort&ring=1&elite=1, plus types/page/mobres for the mob-type stress test) so readability variants can be compared side by side. WeChat and a
// bare URL get the defaults.

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
  /** A red ring under elites, and elites drawn over the horde. */
  eliteRing: boolean;
  /** Fake mob types: the horde cycles through this many hue-shifted copies of the jiangshi. */
  types: number;
  /** Atlas page size the fake types are packed into; 0 gives each type its own texture. */
  page: number;
  /** Resolution of the fake types relative to the baked sheet. */
  mobRes: number;
}

// Defaults picked from the 300-mob readability comparison (2026-10-01).
export const DEFAULT_SCENE: SceneOptions = {
  mobs: 40, ground: 'grass', heroOnTop: true, ring: true, heroOverFx: true, eliteRing: true,
  types: 1, page: 0, mobRes: 1,
};

export function parseScene(query: string): SceneOptions {
  const q = new URLSearchParams(query);
  const mobs = Number(q.get('mobs'));
  const ground = q.get('ground') as GroundKind;
  return {
    mobs: Number.isInteger(mobs) && mobs > 0 ? Math.min(mobs, 2000) : DEFAULT_SCENE.mobs,
    ground: GROUNDS.includes(ground) ? ground : DEFAULT_SCENE.ground,
    heroOnTop: q.has('hero') ? q.get('hero') !== 'sort' : DEFAULT_SCENE.heroOnTop,
    heroOverFx: q.has('hero') ? q.get('hero') === 'overfx' : DEFAULT_SCENE.heroOverFx,
    eliteRing: q.has('elite') ? q.get('elite') === '1' : DEFAULT_SCENE.eliteRing,
    ring: q.has('ring') ? q.get('ring') === '1' : DEFAULT_SCENE.ring,
    types: Math.min(64, intAtLeast(q.get('types'), 1, DEFAULT_SCENE.types)),
    page: [1024, 2048, 4096].includes(Number(q.get('page'))) ? Number(q.get('page')) : DEFAULT_SCENE.page,
    mobRes: q.has('mobres') && Number(q.get('mobres')) >= 0.25 && Number(q.get('mobres')) <= 1 ? Number(q.get('mobres')) : DEFAULT_SCENE.mobRes,
  };
}

function intAtLeast(v: string | null, min: number, fallback: number): number {
  const n = Number(v);
  return v !== null && Number.isInteger(n) && n >= min ? n : fallback;
}
