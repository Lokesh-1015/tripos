import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // This library is the single sanctioned reader of `process.env` (CLAUDE.md
    // §14). It parses and validates the environment with Zod so that every other
    // project can import a typed, already-checked config object. The workspace-wide
    // `no-restricted-properties` ban is therefore lifted here, and only here.
    files: ['src/lib/server-env.ts', 'src/lib/client-env.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
];
