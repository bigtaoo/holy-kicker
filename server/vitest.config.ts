import { defineConfig } from 'vitest/config';
import { engineAlias } from '../build/hkAlias.mjs';
import { coverage, TEST_TIMEOUT } from '../build/coverage.mjs';

// @hk/engine from the sibling package's source, as the client and the bundle (tsconfig paths) take it.
export default defineConfig({
  resolve: { alias: engineAlias },
  test: { testTimeout: TEST_TIMEOUT, coverage: coverage('server', ['src/**/*.ts']) },
});
