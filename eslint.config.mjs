import nx from '@nx/eslint-plugin';

/**
 * TripOS module boundaries.
 *
 * These constraints are the mechanism that makes ADR-0001's modular monolith
 * extractable into services later. A boundary violation is a design signal, not
 * an obstacle to silence — see CLAUDE.md §4 and §15. Never add an
 * `eslint-disable` for `@nx/enforce-module-boundaries` without an ADR.
 *
 * Every project declares tags in its project.json:
 *   scope:  web | api | shared
 *   type:   app | feature | ui | data-access | application | domain | infrastructure | util
 *   domain: trips | expenses | itinerary | polls | checklists | documents | media | chat
 *           | notifications | shared
 */
const depConstraints = [
  // --- Scope: the frontend and backend never import each other. The only
  // thing crossing that line is shared/contracts (ADR-0004, ADR-0009).
  { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'] },
  { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'] },
  { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },

  // --- Layering: dependencies point inward. domain imports nothing outward.
  {
    sourceTag: 'type:app',
    onlyDependOnLibsWithTags: [
      'type:feature',
      'type:ui',
      'type:data-access',
      'type:application',
      'type:domain',
      'type:infrastructure',
      'type:util',
    ],
  },
  {
    // `feature` is the COMPOSITION ROOT: the Nest module here is the one place
    // that knows both a port and its adapter, because binding them is its job.
    // That is why it — and only it — may see `infrastructure` (CLAUDE.md §4).
    // The invariant that actually matters is below: `application` and `domain`
    // must never reach infrastructure.
    sourceTag: 'type:feature',
    onlyDependOnLibsWithTags: [
      'type:feature',
      'type:application',
      'type:domain',
      'type:infrastructure',
      'type:ui',
      'type:data-access',
      'type:util',
    ],
  },
  {
    // Adapters may compose with shared adapters — a domain's Prisma repository
    // depends on the shared Prisma client in `api/shared/database`. Cross-domain
    // reach is still blocked by the `domain:*` constraints below.
    sourceTag: 'type:infrastructure',
    onlyDependOnLibsWithTags: [
      'type:infrastructure',
      'type:application',
      'type:domain',
      'type:util',
    ],
  },
  {
    sourceTag: 'type:application',
    onlyDependOnLibsWithTags: ['type:application', 'type:domain', 'type:util'],
  },
  {
    // Mirrors the `infrastructure` rule: a domain's data-access layer composes
    // with the shared API client in `web/shared/data-access`. Cross-domain reach
    // is still blocked by the `domain:*` constraints below.
    sourceTag: 'type:data-access',
    onlyDependOnLibsWithTags: ['type:data-access', 'type:domain', 'type:util'],
  },
  { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:ui', 'type:util'] },

  // `type:domain` is the innermost layer: pure business rules, no I/O, no
  // framework. It may depend only on other domain code and pure utilities.
  { sourceTag: 'type:domain', onlyDependOnLibsWithTags: ['type:domain', 'type:util'] },
  { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },

  // --- Domain isolation: a domain may depend only on itself and on shared.
  // Cross-domain communication goes through a published application interface
  // or the domain event bus (CLAUDE.md §4). Add a line here per new domain.
  { sourceTag: 'domain:users', onlyDependOnLibsWithTags: ['domain:users', 'domain:shared'] },
  { sourceTag: 'domain:trips', onlyDependOnLibsWithTags: ['domain:trips', 'domain:shared'] },
  { sourceTag: 'domain:expenses', onlyDependOnLibsWithTags: ['domain:expenses', 'domain:shared'] },
  {
    sourceTag: 'domain:itinerary',
    onlyDependOnLibsWithTags: ['domain:itinerary', 'domain:shared'],
  },
  { sourceTag: 'domain:polls', onlyDependOnLibsWithTags: ['domain:polls', 'domain:shared'] },
  {
    sourceTag: 'domain:checklists',
    onlyDependOnLibsWithTags: ['domain:checklists', 'domain:shared'],
  },
  {
    sourceTag: 'domain:documents',
    onlyDependOnLibsWithTags: ['domain:documents', 'domain:shared'],
  },
  { sourceTag: 'domain:media', onlyDependOnLibsWithTags: ['domain:media', 'domain:shared'] },
  { sourceTag: 'domain:chat', onlyDependOnLibsWithTags: ['domain:chat', 'domain:shared'] },
  {
    sourceTag: 'domain:notifications',
    onlyDependOnLibsWithTags: ['domain:notifications', 'domain:shared'],
  },
  { sourceTag: 'domain:shared', onlyDependOnLibsWithTags: ['domain:shared'] },
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/.next',
      '**/vitest.config.*.timestamp*',
      '**/generated/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints,
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'],
    rules: {
      // `any` is banned (CLAUDE.md §10). Use `unknown` and narrow.
      '@typescript-eslint/no-explicit-any': 'error',

      // Unvalidated external input is parsed with Zod, never cast.
      '@typescript-eslint/no-non-null-assertion': 'error',

      // Unused code is deleted, not commented out. `_`-prefixed args are
      // allowed for interface conformance.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Type-only imports must be explicit, so the emitted module graph is
      // predictable. NOTE: this is *not* `verbatimModuleSyntax`, which stays
      // off for apps/api — see tsconfig.base.json for why NestJS DI breaks
      // when an injectable's constructor parameter type is erased.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
    },
  },
  {
    // Direct `process.env` access is centralised in libs/shared/config, which
    // validates it with Zod and fails fast on a bad environment. Everywhere
    // else, import the parsed config instead.
    //
    // NOTE: paths in `ignores` resolve relative to the *nearest* eslint config,
    // and every project has its own that re-exports this one — so a
    // workspace-relative path here would silently never match. The exemption for
    // libs/shared/config lives in that project's own eslint.config.mjs instead.
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.config.{ts,mts,js,mjs,cjs}', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Do not read process.env directly. Import validated config from @tripos/shared/config (CLAUDE.md §14).',
        },
      ],
    },
  },
];
