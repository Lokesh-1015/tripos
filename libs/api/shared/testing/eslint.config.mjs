import baseConfig from '../../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // The workspace bans `process.env` so configuration is read in one validated
    // place (CLAUDE.md §14). This file does something different: it forwards the
    // PARENT environment into a spawned Prisma CLI, alongside the container's
    // connection string. That is process plumbing, not configuration reading —
    // and routing it through the Zod config would be wrong, since the whole
    // point is to pass through whatever the developer or CI already has set.
    files: ['src/lib/test-database.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
];
