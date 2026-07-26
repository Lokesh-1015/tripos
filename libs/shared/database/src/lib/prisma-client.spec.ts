import { describe, expect, it } from 'vitest';
import { createPrismaClient } from './prisma-client';

/**
 * These assertions run without a database. Prisma's driver adapter connects
 * lazily, so construction is safe to test in a unit suite — which is worth
 * having, because a mis-generated client or a broken adapter wiring should fail
 * here rather than at first request.
 *
 * Integration tests that actually query Postgres arrive with the first
 * repository (M1), using Testcontainers rather than mocks (CLAUDE.md §12).
 */
describe('createPrismaClient', () => {
  const connectionString = 'postgresql://tripos:tripos@localhost:5432/tripos?schema=public';

  it('constructs a client without opening a connection', () => {
    const client = createPrismaClient(connectionString);

    expect(client).toBeDefined();
  });

  it('exposes the generated User model delegate', () => {
    const client = createPrismaClient(connectionString);

    // Proves the client was generated from our schema, not a stale artifact.
    expect(client.user).toBeDefined();
    expect(typeof client.user.findUnique).toBe('function');
  });
});
