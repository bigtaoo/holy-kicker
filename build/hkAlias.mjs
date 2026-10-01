import { fileURLToPath } from 'node:url';

// Source alias for the engine package, shared by the client's vite configs. It mirrors the
// `paths` entry in tsconfig.base.json; the engine is consumed as .ts, with no build step.
const ENGINE = fileURLToPath(new URL('../engine', import.meta.url));

export const engineAlias = [
  { find: /^@hk\/engine$/, replacement: `${ENGINE}/index.ts` },
  { find: /^@hk\/engine\//, replacement: `${ENGINE}/` },
];
