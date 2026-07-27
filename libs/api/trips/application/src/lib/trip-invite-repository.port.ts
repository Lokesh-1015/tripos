import type { TripRole } from '@tripos/api/shared/authz';
import type { InviteState } from '@tripos/api/trips/domain';

export interface StoredInvite extends InviteState {
  readonly id: string;
  readonly tripId: string;
  readonly role: TripRole;
}

export interface CreateInviteInput {
  readonly tripId: string;
  readonly tokenHash: string;
  readonly role: TripRole;
  readonly email: string | null;
  readonly expiresAt: Date;
  readonly maxUses: number | null;
  readonly createdById: string;
}

export type RedeemOutcome =
  | { readonly status: 'joined'; readonly tripId: string; readonly role: TripRole }
  | { readonly status: 'already-member'; readonly tripId: string; readonly role: TripRole };

export interface TripInviteRepository {
  create(input: CreateInviteInput): Promise<{ id: string; expiresAt: Date }>;

  findByTokenHash(tokenHash: string): Promise<StoredInvite | null>;

  /**
   * Consumes an invite and creates the membership, atomically.
   *
   * Must be a single transaction that re-checks the use limit while holding the
   * row: two people opening the same last-use link at once would otherwise both
   * pass a prior validity check and both join. The check in the use case is a
   * fast path and a source of good error messages, not the safety net.
   *
   * Idempotent — redeeming twice returns `already-member` rather than erroring,
   * because people double-tap links on slow connections.
   */
  redeem(inviteId: string, userId: string): Promise<RedeemOutcome>;

  revoke(inviteId: string, tripId: string): Promise<void>;
}

export const TRIP_INVITE_REPOSITORY = Symbol('TRIP_INVITE_REPOSITORY');
