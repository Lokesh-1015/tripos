import { z } from 'zod';

/**
 * Browser-visible environment contract.
 *
 * Anything here is `NEXT_PUBLIC_*` and therefore **embedded in the client bundle**
 * — treat every value as public. Never add a secret to this schema (CLAUDE.md §14).
 *
 * Each variable must be referenced with a **literal** key below, because Next
 * inlines these at build time by static analysis. A computed lookup such as
 * `process.env[someVariable]` would silently produce `undefined` in the browser.
 * A literal string index is fine; a dynamic one is not.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3000/api'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

export function loadClientEnv(): ClientEnv {
  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'],
  });

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid public environment:\n${problems}\n\nSee .env.example.`);
  }

  return result.data;
}
