import { loadServerEnv, type ServerEnv } from '@tripos/shared/config';

/**
 * DI token for the validated server environment.
 *
 * The environment is parsed exactly once, by this provider, during module
 * initialisation — so a misconfigured deploy fails at startup rather than at the
 * first request. Everything else injects the result instead of reading
 * `process.env`, which the root ESLint config forbids (CLAUDE.md §14).
 */
export const SERVER_ENV = Symbol('SERVER_ENV');

export const serverEnvProvider = {
  provide: SERVER_ENV,
  useFactory: (): ServerEnv => loadServerEnv(),
};
