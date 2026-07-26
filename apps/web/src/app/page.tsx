import { loadClientEnv } from '@tripos/shared/config';
import type { SystemStatus } from '@tripos/shared/contracts';
import { createApiClient } from '@tripos/web/shared/data-access';

/**
 * Root route — a Server Component (CLAUDE.md §13).
 *
 * This exists to prove the contract pipeline end to end: one Zod schema in
 * `libs/shared/contracts`, implemented by `apps/api`, called here through a
 * client whose types are derived from that same schema. Change the contract and
 * this file stops compiling — which is exactly the property we want
 * (ADR-0004, ADR-0009).
 *
 * The marketing page and authenticated dashboard replace this in M1.
 */
export default async function HomePage() {
  const env = loadClientEnv();
  const api = createApiClient({ baseUrl: env.NEXT_PUBLIC_API_URL });

  let status: SystemStatus | null = null;
  let error: string | null = null;

  try {
    status = await api.system.status();
  } catch (cause) {
    // The API being unreachable must not blank the page — degrade visibly.
    error = cause instanceof Error ? cause.message : 'Unknown error';
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">TripOS</h1>
      <p className="text-text-muted mt-2">A collaborative workspace for group travel.</p>

      <section className="border-border bg-surface-muted mt-8 rounded-[--radius-card] border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">API status</h2>

        {status ? (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-text-muted">Status</dt>
            <dd className="text-positive font-medium">{status.status}</dd>
            <dt className="text-text-muted">Environment</dt>
            <dd>{status.environment}</dd>
            <dt className="text-text-muted">Uptime</dt>
            <dd>{status.uptimeSeconds}s</dd>
            <dt className="text-text-muted">Server time</dt>
            <dd className="font-mono text-xs">{status.serverTime}</dd>
          </dl>
        ) : (
          <p role="status" className="text-danger mt-3 text-sm">
            API unreachable: {error}
          </p>
        )}
      </section>
    </main>
  );
}
