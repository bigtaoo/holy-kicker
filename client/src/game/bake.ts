import { Matrix, type Container, type GenerateTextureOptions, type Renderer, type Texture } from 'pixi.js';

// Textures baked from Graphics (shadows, glows, particle and number atlases). Each one is GPU
// memory: bakeTexture records it against the renderer and releaseBaked frees a run's bakes when
// the run ends (Game.destroy), so replaying does not pile textures up until a phone runs out of
// memory. Bakes that do not depend on the run (keepForSession) stay for the whole session.
// Loaded art is not baked and stays for the next run.
//
// A bake keeps the container it was drawn from: a lost WebGL context comes back with every
// render texture blank, and the bakes are drawn again from their containers when it is restored.

interface Bake {
  tex: Texture;
  options: GenerateTextureOptions & { target: Container };
}

interface Bakes {
  run: Bake[];
  session: Bake[];
  kept: Map<string, unknown>;
}

const baked = new WeakMap<Renderer, Bakes>();
let sessionDepth = 0;

function bakesOf(renderer: Renderer): Bakes {
  let b = baked.get(renderer);
  if (!b) {
    b = { run: [], session: [], kept: new Map() };
    baked.set(renderer, b);
    renderer.runners?.contextChange.add({ contextChange: () => rebake(renderer) });
  }
  return b;
}

/** Bakes `options.target` into a texture; the target belongs to the bake from now on (do not destroy it). */
export function bakeTexture(renderer: Renderer, options: GenerateTextureOptions & { target: Container }): Texture {
  const tex = renderer.generateTexture(options);
  const b = bakesOf(renderer);
  (sessionDepth > 0 ? b.session : b.run).push({ tex, options });
  return tex;
}

/** Returns what `make` baked under `key` on this renderer, baking it on the first call; releaseBaked leaves it. */
export function keepForSession<T>(renderer: Renderer, key: string, make: () => T): T {
  const b = bakesOf(renderer);
  if (b.kept.has(key)) return b.kept.get(key) as T;
  sessionDepth++;
  try {
    const out = make();
    b.kept.set(key, out);
    return out;
  } finally {
    sessionDepth--;
  }
}

/** Draws every bake again into its own texture (after a lost context comes back blank). */
export function rebake(renderer: Renderer): void {
  const b = baked.get(renderer);
  if (!b) return;
  for (const { tex, options } of [...b.session, ...b.run]) {
    const f = options.frame;
    const transform = new Matrix().translate(-(f?.x ?? 0), -(f?.y ?? 0));
    renderer.render({ container: options.target, transform, target: tex, clearColor: [0, 0, 0, 0] });
    tex.source.updateMipmaps();
  }
}

function destroy(list: Bake[]): void {
  for (const { tex, options } of list) {
    tex.destroy(true);
    options.target.destroy({ children: true });
  }
}

/** Destroys every texture the run baked on `renderer` since the last release; session bakes stay. */
export function releaseBaked(renderer: Renderer): void {
  const b = baked.get(renderer);
  if (!b) return;
  destroy(b.run);
  b.run = [];
}

/** How many baked textures `renderer` holds, run and session (for tests and leak checks). */
export function bakedCount(renderer: Renderer): { run: number; session: number } {
  const b = baked.get(renderer);
  return { run: b?.run.length ?? 0, session: b?.session.length ?? 0 };
}
