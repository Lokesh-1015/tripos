import type { TripActor } from '@tripos/api/shared/authz';
import type { PrismaClient } from '@tripos/shared/database';
import type { TripMembershipReader } from './trip-membership.reader';

/**
 * Prisma implementation of the membership lookup.
 *
 * Framework-free by design — the composition root supplies the client, the same
 * pattern as PrismaUserRepository. Selects only what the guard needs; membership
 * is on the hot path for every trip-scoped request.
 */
export class PrismaTripMembershipReader implements TripMembershipReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findActor(tripId: string, userId: string): Promise<TripActor | null> {
    const membership = await this.prisma.tripMembership.findUnique({
      // Uses the (tripId, userId) unique index.
      where: { tripId_userId: { tripId, userId } },
      select: { role: true, status: true },
    });

    if (!membership) {
      return null;
    }

    return {
      userId,
      tripId,
      role: membership.role,
      status: membership.status,
    };
  }
}
