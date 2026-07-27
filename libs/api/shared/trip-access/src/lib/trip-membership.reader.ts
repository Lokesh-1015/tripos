import type { TripActor } from '@tripos/api/shared/authz';

/**
 * Port for loading a caller's membership of a trip.
 *
 * An interface rather than a direct Prisma call so the guard's decision logic can
 * be unit-tested without a database — the whole point of keeping authorization
 * testable (ADR-0006).
 */
export interface TripMembershipReader {
  /** Returns null when the user has no membership row for that trip at all. */
  findActor(tripId: string, userId: string): Promise<TripActor | null>;
}

export const TRIP_MEMBERSHIP_READER = Symbol('TRIP_MEMBERSHIP_READER');
