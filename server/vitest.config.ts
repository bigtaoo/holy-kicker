import { defineConfig } from 'vitest/config';
import { engineAlias } from '../build/hkAlias.mjs';
import { coverage } from '../build/coverage.mjs';

// @hk/engine from the sibling package's source, as the client and the bundle (tsconfig paths) take it.
export default defineConfig({
  resolve: { alias: engineAlias },
  test: { coverage: coverage('server', ['src/**/*.ts']) },
});
