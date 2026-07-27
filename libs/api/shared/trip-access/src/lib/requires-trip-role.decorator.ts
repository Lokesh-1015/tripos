import { SetMetadata } from '@nestjs/common';
import type { TripRole } from '@tripos/api/shared/authz';

export const REQUIRES_TRIP_ROLE_KEY = 'triposRequiresTripRole';

/**
 * Declares the minimum trip role a route requires.
 *
 * `TripAccessGuard` FAILS CLOSED: a route guarded without this decorator is
 * denied, not allowed. That means forgetting the decorator produces a loud 403
 * during development rather than a silent authorization hole in production —
 * the single most important property of the whole mechanism (ADR-0006).
 *
 * @example
 * ```ts
 * @RequiresTripRole('ADMIN')
 * @Patch(':tripId')
 * updateTrip() { ... }
 * ```
 */
export const RequiresTripRole = (role: TripRole) => SetMetadata(REQUIRES_TRIP_ROLE_KEY, role);
