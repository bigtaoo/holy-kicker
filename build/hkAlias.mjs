import { fileURLToPath } from 'node:url';

// Source aliases for the engine package and the backend's wire format, shared by the client's
// vite configs. They mirror the `paths` entries in tsconfig.base.json; both are consumed as
// .ts, with no build step.
const ENGINE = fileURLToPath(new URL('../engine', import.meta.url));
const PROTOCOL = fileURLToPath(new URL('../server/src/protocol.ts', import.meta.url));

export const engineAlias = [
  { find: /^@hk\/engine$/, replacement: `${ENGINE}/index.ts` },
  { find: /^@hk\/engine\//, replacement: `${ENGINE}/` },
  { find: /^@hk\/protocol$/, replacement: PROTOCOL },
];
