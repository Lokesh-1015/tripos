import { checkInviteUsable, hashInviteToken } from '@tripos/api/trips/domain';
import type { RedeemOutcome, TripInviteRepository } from './trip-invite-repository.port';

export interface AcceptInviteCommand {
  readonly token: string;
  readonly actorUserId: string;
}

export class InviteNotAcceptableError extends Error {
  constructor(
    message: string,
    readonly rejection: 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED',
  ) {
    super(message);
    this.name = 'InviteNotAcceptableError';
  }
}

/**
 * Redeems an invite link and joins the trip.
 *
 * This is the most important flow in the product: a trip with one member has no
 * value, so every failure here costs a participant (docs/prd-review.md §4.8).
 * It is therefore idempotent — someone who taps the link twice on a bad
 * connection joins once and sees success both times, not an error the second
 * time.
 *
 * Note the endpoint is authenticated but NOT trip-scoped: the whole point is
 * that the caller is not yet a member, so `TripAccessGuard` cannot apply. The
 * token is the authorization.
 */
export class AcceptInviteUseCase {
  constructor(
    private readonly invites: TripInviteRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: AcceptInviteCommand): Promise<RedeemOutcome> {
    const token = command.token.trim();

    // Look up by hash — the raw token was never stored.
    const invite = await this.invites.findByTokenHash(hashInviteToken(token));

    if (!invite) {
      // Same error shape as an expired one on purpose: distinguishing "no such
      // invite" from "invalid invite" would let someone probe for live tokens.
      throw new InviteNotAcceptableError('This invite link is not valid', 'NOT_FOUND');
    }

    const check = checkInviteUsable(invite, this.now());
    if (!check.usable) {
      throw new InviteNotAcceptableError(check.reason, check.rejection);
    }

    // The repository re-checks limits inside a transaction. This check produced
    // the good error message above; that one is the actual safety net against
    // two people redeeming the last use simultaneously.
    return this.invites.redeem(invite.id, command.actorUserId);
  }
}
