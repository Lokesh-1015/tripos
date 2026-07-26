/**
 * Shared ESLint overrides for NestJS projects (apps/api, apps/worker, and any
 * `libs/api/<domain>/feature` library that declares injectables).
 *
 * Spread this after the root config:
 *
 *   import baseConfig from '../../eslint.config.mjs';
 *   import nestConfig from '../../eslint.nest.mjs';
 *   export default [...baseConfig, ...nestConfig];
 *
 * WHY THIS EXISTS
 * ---------------
 * The root config enforces `@typescript-eslint/consistent-type-imports`, which is
 * right for the web side but actively dangerous for NestJS. Nest resolves
 * dependency injection from constructor parameter types emitted by
 * `emitDecoratorMetadata`. Rewriting
 *
 *   import { ReadinessService } from './readiness.service';
 *
 * as `import type { ... }` erases the runtime reference, the emitted metadata
 * becomes `Object`, and injection fails — at runtime, not at compile time, with
 * an opaque "Nest can't resolve dependencies" error.
 *
 * Autofixing that rule would therefore silently break the API. It is disabled
 * here rather than workspace-wide so the web side keeps the benefit.
 *
 * See the matching note in tsconfig.base.json about `verbatimModuleSyntax`,
 * which is off for the same reason.
 */
export default [
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
