import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/api/users/feature',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'api-users-feature',
    // No unit tests here by design: this library is a thin adapter over Prisma/HTTP.
    // Meaningful coverage needs a real Postgres via Testcontainers, not a mocked
    // client (CLAUDE.md §12) — those integration tests land in M1.
    passWithNoTests: true,
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/api/users/feature',
      provider: 'v8' as const,
    },
  },
}));
