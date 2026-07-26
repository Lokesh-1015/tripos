import { buildUserProfile, type IdentityAttributes } from '@tripos/api/users/domain';
import type { SyncedUser, UserRepository } from './user-repository.port';

export type ClerkUserEventType = 'user.created' | 'user.updated' | 'user.deleted';

export interface ClerkUserEvent {
  readonly type: ClerkUserEventType;
  readonly clerkUserId: string;
  /** Absent for `user.deleted`, which carries only the id. */
  readonly attributes?: IdentityAttributes;
}

export type SyncOutcome =
  | { readonly action: 'upserted'; readonly user: SyncedUser }
  | { readonly action: 'soft-deleted'; readonly user: SyncedUser }
  | { readonly action: 'ignored'; readonly reason: string };

/**
 * Applies a Clerk user event to the local user table.
 *
 * This is the concrete expression of ADR-0003's identity boundary: Clerk owns
 * authentication, this use case maintains the internal `User` row that every
 * other table references. It is deliberately framework-free — no Nest decorators,
 * no HTTP — so it can be unit-tested against a fake repository.
 *
 * Idempotency is a requirement, not a nicety: webhook deliveries retry, and can
 * arrive twice or out of order.
 */
export class SyncClerkUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(event: ClerkUserEvent): Promise<SyncOutcome> {
    if (event.type === 'user.deleted') {
      const user = await this.users.softDeleteByClerkUserId(event.clerkUserId);

      return user
        ? { action: 'soft-deleted', user }
        : { action: 'ignored', reason: 'no local user for that Clerk id' };
    }

    if (!event.attributes) {
      return { action: 'ignored', reason: 'event carried no user attributes' };
    }

    const profile = buildUserProfile(event.attributes);
    const user = await this.users.upsertByClerkUserId(event.clerkUserId, profile);

    return { action: 'upserted', user };
  }
}
