import type { TripActor, TripRole } from '@tripos/api/shared/authz';

export interface TripMemberView {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly role: TripRole;
  readonly joinedAt: Date;
}

export interface TripMemberRepository {
  /** Active members only. Removed members keep their row but are not listed. */
  listActive(tripId: string): Promise<TripMemberView[]>;

  /** Loads a member as an actor so policies can be applied against them. */
  findActor(tripId: string, userId: string): Promise<TripActor | null>;

  updateRole(tripId: string, userId: string, role: TripRole): Promise<void>;

  /**
   * Marks a membership REMOVED. Never deletes the row: their expenses and
   * messages reference it, and removing it would corrupt the group's balances
   * (ADR-0005).
   */
  markRemoved(tripId: string, userId: string): Promise<void>;

  /**
   * Moves ownership between two members, atomically.
   *
   * Both writes must land together: a crash after demoting the old owner but
   * before promoting the new one leaves the trip with NO owner — unmanageable
   * and unrecoverable through the UI, since only an owner can transfer.
   */
  transferOwnership(tripId: string, fromUserId: string, toUserId: string): Promise<void>;
}

export const TRIP_MEMBER_REPOSITORY = Symbol('TRIP_MEMBER_REPOSITORY');
