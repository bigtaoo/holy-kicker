import { defineConfig } from 'vitest/config';
import { coverage } from '../build/coverage.mjs';

export default defineConfig({ test: { coverage: coverage('engine', ['**/*.ts']) } });
