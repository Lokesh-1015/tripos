import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * Integration tests against a real Postgres started by Testcontainers.
 *
 * Separate from the unit config because these need Docker and take tens of
 * seconds. Timeouts are generous: pulling the image on a cold machine dominates
 * the first run.
 */
export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/api/trips/infrastructure-integration',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'api-trips-infrastructure-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    // One container per file — running files in parallel would start several.
    fileParallelism: false,
    reporters: ['default'],
  },
}));
