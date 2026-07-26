/**
 * Trip authorization roles (ADR-0006).
 *
 * Declared here rather than imported from Prisma so that policy logic stays pure
 * and framework-free — these functions must be unit-testable without a database
 * or a generated client anywhere in the graph. The Prisma enum mirrors this;
 * `assertRolesMatchSchema` in the spec guards them against drifting apart.
 */
export const TRIP_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;

export type TripRole = (typeof TRIP_ROLES)[number];

export type TripMembershipStatus = 'ACTIVE' | 'REMOVED';

/**
 * Rank, highest authority first. Comparisons use this rather than string
 * equality so a new role can be slotted in without rewriting every check.
 */
const ROLE_RANK: Record<TripRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
  VIEWER: 0,
};

/** The actor making a request, as resolved from their trip membership. */
export interface TripActor {
  readonly userId: string;
  readonly tripId: string;
  readonly role: TripRole;
  readonly status: TripMembershipStatus;
}

export function hasAtLeastRole(actual: TripRole, required: TripRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function outranks(actor: TripRole, target: TripRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}
