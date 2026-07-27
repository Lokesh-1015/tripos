import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createPrismaClient, type PrismaClient } from '@tripos/shared/database';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Walks up to the workspace root.
 *
 * Tests run with the library as cwd, but `prisma.config.ts` — which supplies the
 * schema path and migrations directory — lives at the root (ADR-0011).
 */
function findWorkspaceRoot(from: string = process.cwd()): string {
  let current = resolve(from);

  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;

    const parent = dirname(current);
    if (parent === current) {
      throw new Error('Could not locate the workspace root from ' + from);
    }
    current = parent;
  }
}

export interface TestDatabase {
  readonly prisma: PrismaClient;
  readonly connectionString: string;
  /** Empties every table, preserving schema. Call between tests. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * A disposable Postgres for integration tests.
 *
 * CLAUDE.md §12 forbids mocking Prisma, and for good reason: the behaviour worth
 * testing here IS the database's. Transaction atomicity, unique constraints, and
 * conditional updates are exactly what a mock cannot reproduce — a suite that
 * passes against a fake Prisma proves only that the fake agrees with itself.
 *
 * Pinned to the same Postgres 17 the app runs on locally and in CI, so the tests
 * exercise the engine that will actually serve production.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('tripos_test')
    .withUsername('tripos')
    .withPassword('tripos')
    .start();

  const connectionString = container.getConnectionUri();

  // Apply real migrations rather than `db push`. If a migration is broken, these
  // tests should be the thing that catches it — pushing the schema directly
  // would hide exactly that failure.
  //
  // The CLI's JS entrypoint is invoked with the current node binary rather than
  // via `npx`: spawning a `.cmd` shim needs a shell on Windows, and shelling out
  // to run a build step is both slower and an injection surface.
  const workspaceRoot = findWorkspaceRoot();

  execFileSync(
    process.execPath,
    [join(workspaceRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: workspaceRoot,
      env: { ...process.env, DATABASE_URL: connectionString },
      stdio: 'pipe',
    },
  );

  const prisma = createPrismaClient(connectionString);

  return {
    prisma,
    connectionString,
    async reset() {
      // TRUNCATE ... CASCADE in one statement: faster than per-table deletes and
      // it resets identity sequences, so ids do not leak between tests.
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE votes, poll_options, polls, trip_invites, trip_memberships, trips, users RESTART IDENTITY CASCADE',
      );
    },
    async stop() {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}

/** Inserts a user directly, bypassing the Clerk sync path these tests do not exercise. */
export async function seedUser(
  prisma: PrismaClient,
  overrides: { id?: string; email?: string; displayName?: string } = {},
): Promise<{ id: string }> {
  const suffix = Math.random().toString(36).slice(2, 10);

  return prisma.user.create({
    data: {
      clerkUserId: `clerk_${suffix}`,
      email: overrides.email ?? `user_${suffix}@example.com`,
      displayName: overrides.displayName ?? `User ${suffix}`,
      ...(overrides.id ? { id: overrides.id } : {}),
    },
    select: { id: true },
  });
}
