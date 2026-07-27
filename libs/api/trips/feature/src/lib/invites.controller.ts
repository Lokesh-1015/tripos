import { BadRequestException, Controller, GoneException } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '@tripos/api/shared/auth';
import { AcceptInviteUseCase, InviteNotAcceptableError } from '@tripos/api/trips/application';
import { InviteRaceLostError } from '@tripos/api/trips/infrastructure';
import { contract } from '@tripos/shared/contracts';
import { Implement, implement } from '@orpc/nest';

/**
 * Redeeming an invite.
 *
 * Deliberately NOT behind `TripAccessGuard`: the entire point is that the caller
 * is not a member yet, so there is no membership to check. The token is the
 * authorization, which is why it is 256 bits of randomness stored only as a hash
 * (see invite-token.ts).
 *
 * Authentication still applies — you must be a signed-in TripOS user to join,
 * because membership references an internal User.id.
 */
@Controller()
export class InvitesController {
  constructor(private readonly acceptInvite: AcceptInviteUseCase) {}

  @Implement(contract.trips.acceptInvite)
  accept(@CurrentUser() user: AuthenticatedUser) {
    return implement(contract.trips.acceptInvite).handler(async ({ input }) => {
      try {
        return await this.acceptInvite.execute({
          token: input.token,
          actorUserId: user.userId,
        });
      } catch (error) {
        if (error instanceof InviteNotAcceptableError) {
          // 410 Gone for a link that was once valid but no longer is — it tells
          // the UI to say "this link has expired" rather than "bad request".
          const expired = error.rejection === 'EXPIRED' || error.rejection === 'EXHAUSTED';
          throw expired ? new GoneException(error.message) : new BadRequestException(error.message);
        }

        // Lost the race for the last use of a limited invite.
        if (error instanceof InviteRaceLostError) {
          throw new GoneException(error.message);
        }

        throw error;
      }
    });
  }
}
