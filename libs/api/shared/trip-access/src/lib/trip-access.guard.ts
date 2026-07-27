import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_CONTEXT_KEY, type AuthenticatedUser } from '@tripos/api/shared/auth';
import {
  canViewTrip,
  hasAtLeastRole,
  type TripActor,
  type TripRole,
} from '@tripos/api/shared/authz';
import type { IncomingMessage } from 'node:http';
import { REQUIRES_TRIP_ROLE_KEY } from './requires-trip-role.decorator';
import { TRIP_ACTOR_KEY } from './trip-actor';
import { TRIP_MEMBERSHIP_READER, type TripMembershipReader } from './trip-membership.reader';

type TripRequest = IncomingMessage & {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  [AUTH_CONTEXT_KEY]?: AuthenticatedUser;
  [TRIP_ACTOR_KEY]?: TripActor;
};

/**
 * The single mechanism for trip-scoped authorization (ADR-0006).
 *
 * There is deliberately no second way to do this. Every trip-scoped endpoint
 * uses this guard with `@RequiresTripRole(...)`, so "can this person touch this
 * trip" is answered in exactly one place and can be audited in exactly one place.
 *
 * Three properties matter:
 *  - It FAILS CLOSED. No decorator means denied.
 *  - It never trusts a client-supplied role — membership is read from the
 *    database on every request.
 *  - It resolves the actor once and attaches it, so handlers applying
 *    fine-grained policies do not re-query.
 */
@Injectable()
export class TripAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TRIP_MEMBERSHIP_READER) private readonly memberships: TripMembershipReader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<TripRole | undefined>(
      REQUIRES_TRIP_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Fail closed. Reaching this guard without declaring a required role is a
    // programming error, and the safe response to a programming error in an
    // authorization path is refusal.
    if (!requiredRole) {
      throw new ForbiddenException('Route is trip-scoped but declares no required role');
    }

    const request = context.switchToHttp().getRequest<TripRequest>();
    const auth = request[AUTH_CONTEXT_KEY];

    if (!auth) {
      throw new UnauthorizedException();
    }

    const tripId = resolveTripId(request);
    if (!tripId) {
      throw new ForbiddenException('No trip id present on a trip-scoped route');
    }

    const actor = await this.memberships.findActor(tripId, auth.userId);

    // Indistinguishable from "trip does not exist", on purpose: a 404-vs-403
    // difference would let anyone enumerate which trip ids are real.
    if (!actor) {
      throw new ForbiddenException('You do not have access to this trip');
    }

    const visible = canViewTrip(actor);
    if (!visible.allowed) {
      throw new ForbiddenException(visible.reason);
    }

    if (!hasAtLeastRole(actor.role, requiredRole)) {
      throw new ForbiddenException(`This action requires the ${requiredRole} role or above`);
    }

    request[TRIP_ACTOR_KEY] = actor;

    return true;
  }
}

/**
 * Finds the trip id on the request.
 *
 * Route params first: they are the least forgeable, since they are matched by
 * the router rather than supplied in a payload. Body and query are accepted for
 * creation-adjacent routes, but the id is only ever used to LOOK UP membership —
 * it never grants anything by itself.
 */
export function resolveTripId(request: {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): string | null {
  const candidates = [
    request.params?.['tripId'],
    request.params?.['id'],
    request.query?.['tripId'],
    request.body?.['tripId'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}
