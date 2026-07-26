import type { SyncedUser, UserRepository } from '@tripos/api/users/application';
import type { UserProfile } from '@tripos/api/users/domain';
import type { PrismaClient } from '@tripos/shared/database';

/**
 * Prisma-backed implementation of the `UserRepository` port.
 *
 * Prisma appears here and nowhere above this layer (CLAUDE.md §4) — the use case
 * depends on the interface, so it stays testable without a database and the
 * module stays extractable.
 *
 * DELIBERATELY FREE OF NEST DECORATORS. The client is an ordinary constructor
 * argument, and `UsersModule` (the composition root) supplies it via a factory.
 * That keeps this adapter usable outside an HTTP process — the `users:backfill`
 * reconciliation script constructs it directly — and means importing it never
 * drags in Nest's decorator transform.
 */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertByClerkUserId(clerkUserId: string, profile: UserProfile): Promise<SyncedUser> {
    // A single upsert keyed on the unique clerkUserId is what makes retried and
    // out-of-order webhook deliveries safe — the database enforces idempotency
    // rather than application-level check-then-write, which would race.
    const user = await this.prisma.user.upsert({
      where: { clerkUserId },
      create: {
        clerkUserId,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
      update: {
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        // Re-creating an account in Clerk with the same id revives the local row.
        deletedAt: null,
      },
      select: { id: true, clerkUserId: true, email: true, displayName: true },
    });

    return user;
  }

  async softDeleteByClerkUserId(clerkUserId: string): Promise<SyncedUser | null> {
    const existing = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, clerkUserId: true, email: true, displayName: true, deletedAt: true },
    });

    if (!existing) {
      return null;
    }

    const { deletedAt, ...user } = existing;

    // Already deleted: return as-is. Re-stamping would let a retried delivery
    // drift the recorded deletion time, and that timestamp is audit data — it
    // should record when the user actually left, not when Clerk last retried.
    if (deletedAt !== null) {
      return user;
    }

    // Soft delete only. Ledger entries and trip memberships reference this row;
    // removing it would corrupt other members' balances (ADR-0005).
    return this.prisma.user.update({
      where: { clerkUserId },
      data: { deletedAt: new Date() },
      select: { id: true, clerkUserId: true, email: true, displayName: true },
    });
  }
}
