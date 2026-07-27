import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * Integration tests against a real Postgres started by Testcontainers.
 * See the trips equivalent for why this is separate from the unit config.
 */
export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/api/polls/infrastructure-integration',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'api-polls-infrastructure-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    reporters: ['default'],
  },
}));
