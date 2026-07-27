import type { TripRole } from '@tripos/api/shared/authz';
import {
  defaultInviteExpiry,
  generateInviteToken,
  hashInviteToken,
} from '@tripos/api/trips/domain';
import type { CreateInviteInput, TripInviteRepository } from './trip-invite-repository.port';

export interface CreateInviteCommand {
  readonly tripId: string;
  readonly role?: TripRole;
  readonly email?: string | null;
  readonly maxUses?: number | null;
  readonly expiresAt?: Date;
  readonly actorUserId: string;
}

export interface CreatedInvite {
  readonly id: string;
  /** The RAW token. Returned exactly once; only its hash is persisted. */
  readonly token: string;
  readonly expiresAt: Date;
}

export class InvalidInviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInviteError';
  }
}

/**
 * Issues an invite link.
 *
 * The caller's permission to invite is checked by `TripAccessGuard` before this
 * runs; what this owns is the token's secrecy and limits.
 */
export class CreateInviteUseCase {
  constructor(
    private readonly invites: TripInviteRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: CreateInviteCommand): Promise<CreatedInvite> {
    const role = command.role ?? 'MEMBER';

    // OWNER is transferred explicitly, never handed out by a link. An invite
    // that grants ownership would let anyone holding the URL take over a trip.
    if (role === 'OWNER') {
      throw new InvalidInviteError('Invites cannot grant ownership');
    }

    if (command.maxUses !== undefined && command.maxUses !== null && command.maxUses < 1) {
      throw new InvalidInviteError('An invite must allow at least one use');
    }

    const now = this.now();
    const expiresAt = command.expiresAt ?? defaultInviteExpiry(now);

    if (expiresAt.getTime() <= now.getTime()) {
      throw new InvalidInviteError('Invite expiry must be in the future');
    }

    const token = generateInviteToken();

    const input: CreateInviteInput = {
      tripId: command.tripId,
      // Only the hash is stored — see invite-token.ts for why.
      tokenHash: hashInviteToken(token),
      role,
      email: command.email?.trim().toLowerCase() || null,
      expiresAt,
      maxUses: command.maxUses ?? null,
      createdById: command.actorUserId,
    };

    const created = await this.invites.create(input);

    return { id: created.id, token, expiresAt: created.expiresAt };
  }
}
