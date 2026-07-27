import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/api/trips/infrastructure',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'api-trips-infrastructure',
    // Thin adapter/HTTP layer: meaningful coverage needs a real Postgres via
    // Testcontainers, not a mocked client (CLAUDE.md §12). Those land with the
    // integration suite.
    passWithNoTests: true,
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Integration specs are excluded here and run by the `test-integration`
    // target instead. They start a Docker container, so keeping them out of the
    // default run is what keeps `nx test` a fast inner loop.
    exclude: ['**/*.integration.spec.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/api/trips/infrastructure',
      provider: 'v8' as const,
    },
  },
}));
