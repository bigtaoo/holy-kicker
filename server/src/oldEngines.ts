import type { EngineModule } from './resim';

// The engines of the few ENGINE_VERSIONs before this one, by version, each loaded on first use.
// Empty in the source (the tests and typecheck see only the current engine): server/build.mjs
// fills it in the bundle from git (build/engines.mjs), so a run recorded on an older engine
// (a client not yet updated, or one queued across a deploy) still re-simulates.
export const OLD_ENGINES: Record<number, () => Promise<EngineModule>> = {};
