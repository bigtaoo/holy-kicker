import { afterEach, describe, expect, it } from 'vitest';
import { engineFor, KNOWN_ENGINES } from './engines';
import { OLD_ENGINES } from './oldEngines';
import { CURRENT_ENGINE, type EngineModule } from './resim';

// OLD_ENGINES is empty in the source (the bundle fills it), so these put stand-ins in it.
const V = CURRENT_ENGINE.ENGINE_VERSION;
const stand = (version: number) => ({ ...CURRENT_ENGINE, ENGINE_VERSION: version }) as EngineModule;

afterEach(() => {
  for (const k of Object.keys(OLD_ENGINES)) delete OLD_ENGINES[Number(k)];
});

describe('engineFor', () => {
  it("knows its own engine first and nothing it was not built with", async () => {
    expect(KNOWN_ENGINES[0]).toBe(V);
    expect(await engineFor(V)).toBe(CURRENT_ENGINE);
    expect(await engineFor(V + 1)).toBeNull();
    expect(await engineFor(-1)).toBeNull();
  });

  it('loads an older engine once and keeps it', async () => {
    let loads = 0;
    const old = stand(V - 1);
    OLD_ENGINES[V - 1] = async () => (loads++, old);
    const [a, b] = await Promise.all([engineFor(V - 1), engineFor(V - 1)]);
    expect(a).toBe(old);
    expect(b).toBe(old);
    expect(await engineFor(V - 1)).toBe(old);
    expect(loads).toBe(1);
  });

  it('gives null for a bundle that fails to load or is another version, and does not retry it', async () => {
    let loads = 0;
    OLD_ENGINES[V - 2] = () => (loads++, Promise.reject(new Error('chunk missing')));
    OLD_ENGINES[V - 3] = async () => (loads++, stand(V - 4));
    expect(await engineFor(V - 2)).toBeNull();
    expect(await engineFor(V - 3)).toBeNull();
    expect(await engineFor(V - 2)).toBeNull();
    expect(await engineFor(V - 3)).toBeNull();
    expect(loads).toBe(2);
  });
});
