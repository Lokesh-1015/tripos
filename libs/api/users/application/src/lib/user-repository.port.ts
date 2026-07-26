import type { UserProfile } from '@tripos/api/users/domain';

export interface SyncedUser {
  readonly id: string;
  readonly clerkUserId: string;
  readonly email: string;
  readonly displayName: string;
}

/**
 * Port for user persistence.
 *
 * The application layer depends on this interface, never on Prisma — that is what
 * lets the use case be unit-tested without a database, and what would let the
 * users module be extracted to its own service later (ADR-0001). The Prisma
 * implementation lives in `libs/api/users/infrastructure`.
 */
export interface UserRepository {
  /**
   * Creates or updates the user identified by `clerkUserId`.
   *
   * MUST be idempotent: webhook deliveries are retried, and can arrive
   * out of order or more than once.
   */
  upsertByClerkUserId(clerkUserId: string, profile: UserProfile): Promise<SyncedUser>;

  /**
   * Soft-deletes the user. Never a hard delete: trip ledger entries reference
   * this row, and removing it would corrupt other members' balances
   * (ADR-0005, docs/prd-review.md §4.9).
   *
   * Returns null when no such user exists, so a duplicate or out-of-order
   * delete is a no-op rather than an error.
   */
  softDeleteByClerkUserId(clerkUserId: string): Promise<SyncedUser | null>;
}

/** DI token. A string-free symbol so it cannot collide with another provider. */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
