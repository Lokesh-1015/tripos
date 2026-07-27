import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/api/trips/feature',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'api-trips-feature',
    // Thin adapter/HTTP layer: meaningful coverage needs a real Postgres via
    // Testcontainers, not a mocked client (CLAUDE.md §12). Those land with the
    // integration suite.
    passWithNoTests: true,
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/api/trips/feature',
      provider: 'v8' as const,
    },
  },
}));
