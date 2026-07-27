import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TripActor } from '@tripos/api/shared/authz';

export const TRIP_ACTOR_KEY = 'triposTripActor';

interface RequestWithTripActor {
  [TRIP_ACTOR_KEY]?: TripActor;
}

/**
 * Injects the caller's membership of the trip being acted on.
 *
 * Resolved once by `TripAccessGuard`, so a handler that needs to apply a
 * fine-grained policy (`canRemoveMember`, `canChangeMemberRole`) does not query
 * membership a second time.
 */
export const CurrentTripActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TripActor => {
    const request = ctx.switchToHttp().getRequest<RequestWithTripActor>();
    const actor = request[TRIP_ACTOR_KEY];

    if (!actor) {
      throw new Error(
        'CurrentTripActor used on a route without TripAccessGuard. Apply the guard or remove the decorator.',
      );
    }

    return actor;
  },
);
