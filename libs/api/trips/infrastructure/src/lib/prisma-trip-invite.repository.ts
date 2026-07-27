import type {
  CreateInviteInput,
  RedeemOutcome,
  StoredInvite,
  TripInviteRepository,
} from '@tripos/api/trips/application';
import type { PrismaClient } from '@tripos/shared/database';

export class InviteRaceLostError extends Error {
  constructor() {
    super('This invite link has already been used the maximum number of times');
    this.name = 'InviteRaceLostError';
  }
}

export class PrismaTripInviteRepository implements TripInviteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateInviteInput): Promise<{ id: string; expiresAt: Date }> {
    const invite = await this.prisma.tripInvite.create({
      data: {
        tripId: input.tripId,
        tokenHash: input.tokenHash,
        role: input.role,
        email: input.email,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses,
        createdById: input.createdById,
      },
      select: { id: true, expiresAt: true },
    });

    return invite;
  }

  async findByTokenHash(tokenHash: string): Promise<StoredInvite | null> {
    return this.prisma.tripInvite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tripId: true,
        role: true,
        expiresAt: true,
        revokedAt: true,
        maxUses: true,
        useCount: true,
      },
    });
  }

  /**
   * Consumes an invite and creates the membership atomically.
   *
   * The use case already checked validity, but that check is a fast path for
   * good error messages — NOT the safety net. Two people opening the same
   * last-use link simultaneously would both pass it. The guarantee lives here:
   *
   *  - The `updateMany` carries the use limit in its WHERE clause, so the
   *    database decides who wins. A count of 0 means someone else took the last
   *    use between the check and now.
   *  - Membership is upserted, so a double-tap on a slow connection joins once
   *    and reports success both times rather than erroring the second time.
   *    Losing a member to a duplicate-key error would be a real cost — a trip
   *    with one member has no value (docs/prd-review.md §4.8).
   */
  async redeem(inviteId: string, userId: string): Promise<RedeemOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.tripInvite.findUnique({
        where: { id: inviteId },
        select: { tripId: true, role: true, maxUses: true },
      });

      if (!invite) {
        throw new InviteRaceLostError();
      }

      const existing = await tx.tripMembership.findUnique({
        where: { tripId_userId: { tripId: invite.tripId, userId } },
        select: { role: true, status: true },
      });

      // Already an active member: idempotent success, and do NOT burn a use.
      if (existing && existing.status === 'ACTIVE') {
        return { status: 'already-member' as const, tripId: invite.tripId, role: existing.role };
      }

      // Atomic conditional increment. If maxUses is set, the WHERE clause makes
      // the database the arbiter of the last use.
      const consumed = await tx.tripInvite.updateMany({
        where: {
          id: inviteId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          ...(invite.maxUses === null ? {} : { useCount: { lt: invite.maxUses } }),
        },
        data: { useCount: { increment: 1 } },
      });

      if (consumed.count === 0) {
        throw new InviteRaceLostError();
      }

      // Upsert rather than create: a previously REMOVED member rejoining via a
      // fresh link should be reinstated, not rejected by the unique constraint.
      await tx.tripMembership.upsert({
        where: { tripId_userId: { tripId: invite.tripId, userId } },
        create: {
          tripId: invite.tripId,
          userId,
          role: invite.role,
          status: 'ACTIVE',
        },
        update: { role: invite.role, status: 'ACTIVE', removedAt: null },
      });

      return { status: 'joined' as const, tripId: invite.tripId, role: invite.role };
    });
  }

  async revoke(inviteId: string, tripId: string): Promise<void> {
    // tripId is in the WHERE clause so an invite id from another trip cannot be
    // revoked by someone who only administers this one.
    await this.prisma.tripInvite.updateMany({
      where: { id: inviteId, tripId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
