import type { TripRole } from '@tripos/api/shared/authz';
import type { TripStatus } from '@tripos/api/trips/domain';

export interface TripSummary {
  readonly id: string;
  readonly name: string;
  readonly destination: string | null;
  readonly timezone: string;
  readonly baseCurrency: string;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly status: TripStatus;
  readonly memberCount: number;
  /** The requesting user's role — absent when listing trips they don't belong to. */
  readonly myRole: TripRole;
}

export interface CreateTripInput {
  readonly name: string;
  readonly destination: string | null;
  readonly timezone: string;
  readonly baseCurrency: string;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly createdById: string;
}

export interface TripRepository {
  /**
   * Creates a trip AND its owner membership atomically.
   *
   * These must be one transaction: a trip whose creator has no membership row is
   * invisible and unmanageable — nobody could invite, edit, or delete it. The
   * repository owns the transaction because only it knows the storage engine.
   */
  createWithOwner(input: CreateTripInput): Promise<TripSummary>;

  /** Trips the user is an ACTIVE member of. Removed members see nothing. */
  listForUser(userId: string): Promise<TripSummary[]>;

  findByIdForUser(tripId: string, userId: string): Promise<TripSummary | null>;
}

export const TRIP_REPOSITORY = Symbol('TRIP_REPOSITORY');
