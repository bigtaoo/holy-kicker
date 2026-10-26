import { defineConfig } from 'vitest/config';
import { coverage, TEST_TIMEOUT } from '../build/coverage.mjs';

export default defineConfig({ test: { testTimeout: TEST_TIMEOUT, coverage: coverage('engine', ['**/*.ts']) } });
