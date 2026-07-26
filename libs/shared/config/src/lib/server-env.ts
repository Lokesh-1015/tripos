import { z } from 'zod';

/**
 * Server-side environment contract.
 *
 * This is the ONLY place in the codebase permitted to read `process.env` — the
 * root ESLint config enforces that (CLAUDE.md §14). Everywhere else imports the
 * parsed, validated result, so a missing or malformed variable is a startup
 * failure with a readable message rather than an `undefined` surfacing three
 * layers deep at request time.
 *
 * Add a variable here and to `.env.example` in the same commit.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Port the HTTP server binds to. Hosting platforms inject this. */
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /** Origin allowed to call the API. Comma-separated for multiple. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

  /** Postgres connection string. Owned by libs/shared/database. */
  DATABASE_URL: z.string().min(1),

  /** Redis connection string. Used for caching, BullMQ, and the Socket.IO adapter. */
  REDIS_URL: z.string().min(1),

  /** Structured log level (pino). */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Signing secret for Clerk user-sync webhooks (ADR-0003).
   *
   * Optional so the API still boots without it — local work that does not touch
   * webhooks stays unblocked. The webhook endpoint returns 503 when it is absent
   * rather than accepting unverified payloads, which would let anyone create or
   * delete users.
   */
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().startsWith('whsec_').optional(),

  /**
   * Clerk Backend API key. Used by the reconciliation backfill to read users
   * that predate the webhook endpoint, or whose deliveries failed.
   *
   * Optional for the same reason as the signing secret: the API boots without it.
   * NEVER expose this to the client — it is not a NEXT_PUBLIC_* value.
   */
  CLERK_SECRET_KEY: z.string().startsWith('sk_').optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Parses and validates the server environment.
 *
 * Deliberately a function rather than a module-level constant: parsing at import
 * time would make builds, type-checks, and unit tests all require a fully
 * populated environment. Call this once during bootstrap and inject the result.
 *
 * @throws if any variable is missing or malformed, listing every problem at once
 *         rather than failing on the first.
 */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid server environment. Fix these and restart:\n${problems}\n\n` +
        `See .env.example for the expected shape.`,
    );
  }

  return result.data;
}

export const isProduction = (env: ServerEnv): boolean => env.NODE_ENV === 'production';
