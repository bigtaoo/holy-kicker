import { CURRENT_ENGINE, type EngineModule } from './resim';
import { OLD_ENGINES } from './oldEngines';

// Which engines this server can re-simulate with: its own and the older ones bundled beside it.

/** The ENGINE_VERSIONs this server can re-simulate, its own first. */
export const KNOWN_ENGINES: readonly number[] = [CURRENT_ENGINE.ENGINE_VERSION, ...Object.keys(OLD_ENGINES).map(Number)];

/** Finds the engine of a version, null when this server has none (an engine too old, or newer than the server). */
export type Engines = (version: number) => Promise<EngineModule | null>;

const loaded = new Map<number, Promise<EngineModule | null>>();

export const engineFor: Engines = (version) => {
  if (version === CURRENT_ENGINE.ENGINE_VERSION) return Promise.resolve(CURRENT_ENGINE);
  const load = OLD_ENGINES[version];
  if (!load) return Promise.resolve(null);
  let m = loaded.get(version);
  if (!m) {
    m = load().then((e) => (e.ENGINE_VERSION === version ? e : null), () => null);
    loaded.set(version, m);
  }
  return m;
};
