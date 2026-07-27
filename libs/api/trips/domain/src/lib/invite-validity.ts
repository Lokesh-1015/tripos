/**
 * The stored state of an invite, as the domain needs to see it.
 *
 * Deliberately not the Prisma row: this layer must stay free of the generated
 * client so these rules are testable without a database (CLAUDE.md §4).
 */
export interface InviteState {
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly maxUses: number | null;
  readonly useCount: number;
}

export type InviteRejection = 'REVOKED' | 'EXPIRED' | 'EXHAUSTED';

export type InviteCheck =
  | { readonly usable: true }
  | { readonly usable: false; readonly rejection: InviteRejection; readonly reason: string };

/**
 * Decides whether an invite can still be redeemed.
 *
 * Order matters for the message the user sees: a revoked invite is revoked even
 * if it has also expired, because "the organiser cancelled this link" is more
 * accurate and more actionable than "this link expired".
 *
 * An unbounded invite endpoint is a spam vector, which is why expiry and use
 * limits are enforced here rather than left to the UI.
 */
export function checkInviteUsable(invite: InviteState, now: Date): InviteCheck {
  if (invite.revokedAt !== null) {
    return { usable: false, rejection: 'REVOKED', reason: 'This invite link has been revoked' };
  }

  if (invite.expiresAt.getTime() <= now.getTime()) {
    return { usable: false, rejection: 'EXPIRED', reason: 'This invite link has expired' };
  }

  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
    return {
      usable: false,
      rejection: 'EXHAUSTED',
      reason: 'This invite link has already been used the maximum number of times',
    };
  }

  return { usable: true };
}

/** Default lifetime for a share link. Long enough to plan, short enough to matter. */
export const DEFAULT_INVITE_TTL_DAYS = 14;

export function defaultInviteExpiry(now: Date): Date {
  return new Date(now.getTime() + DEFAULT_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
