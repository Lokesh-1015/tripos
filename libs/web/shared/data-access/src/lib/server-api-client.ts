import { loadClientEnv } from '@tripos/shared/config';
import { auth } from '@clerk/nextjs/server';
import { createApiClient, type ApiClient } from './api-client';

/**
 * An API client carrying the caller's Clerk session token.
 *
 * SERVER ONLY — it reads the Clerk session from request context, so it must be
 * called from a Server Component, Route Handler, or Server Action. The token
 * never reaches the browser this way, which is the point.
 *
 * The header is produced by a callback rather than captured once, so a token
 * that refreshes mid-render is picked up on the next call instead of a stale one
 * being reused.
 */
export async function createServerApiClient(): Promise<ApiClient> {
  // Next 15+: auth() is async and must be awaited.
  const { getToken } = await auth();

  return createApiClient({
    baseUrl: loadClientEnv().NEXT_PUBLIC_API_URL,
    headers: async () => {
      const token = await getToken();

      // Anonymous is a legitimate state — public endpoints exist, and the API
      // answers 401 for the rest. Sending "Bearer null" would be worse.
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  });
}
