export const TRIP_STATUSES = ['DRAFT', 'PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

/**
 * Legal lifecycle transitions.
 *
 * The lifecycle gates behaviour across the whole product — when voting closes,
 * when live location is permitted, when Trip Replay generates
 * (docs/prd-review.md §4.5) — so the transitions are declared once here rather
 * than re-derived by each feature.
 *
 * ARCHIVED is terminal by design: a trip can be un-archived only by an explicit
 * restore, which is a different operation with its own permission check. Letting
 * archive flip freely would make "archived" meaningless as a filter.
 */
const ALLOWED_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  DRAFT: ['PLANNING', 'ARCHIVED'],
  PLANNING: ['ACTIVE', 'COMPLETED', 'ARCHIVED'],
  // A trip can return to PLANNING: dates slip, and people do re-plan mid-trip.
  ACTIVE: ['COMPLETED', 'PLANNING', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionTo(from: TripStatus, to: TripStatus): boolean {
  if (from === to) {
    // Idempotent no-op: re-sending the current status must not error, because
    // clients retry.
    return true;
  }

  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidTripTransitionError extends Error {
  constructor(from: TripStatus, to: TripStatus) {
    super(`A trip cannot move from ${from} to ${to}`);
    this.name = 'InvalidTripTransitionError';
  }
}

export function assertTransition(from: TripStatus, to: TripStatus): void {
  if (!canTransitionTo(from, to)) {
    throw new InvalidTripTransitionError(from, to);
  }
}

/** Trips that accept new content. Archived and completed trips are read-mostly. */
export function acceptsNewContent(status: TripStatus): boolean {
  return status === 'DRAFT' || status === 'PLANNING' || status === 'ACTIVE';
}
