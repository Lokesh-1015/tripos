import type { TripActor, TripRole } from '@tripos/api/shared/authz';
import type { TripMemberRepository, TripMemberView } from '@tripos/api/trips/application';
import type { PrismaClient } from '@tripos/shared/database';

export class PrismaTripMemberRepository implements TripMemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listActive(tripId: string): Promise<TripMemberView[]> {
    const rows = await this.prisma.tripMembership.findMany({
      // Scoped by tripId, as every trip-scoped query must be (CLAUDE.md §7).
      where: { tripId, status: 'ACTIVE' },
      select: {
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: { displayName: true, email: true, avatarUrl: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.user.displayName,
      email: row.user.email,
      avatarUrl: row.user.avatarUrl,
      role: row.role,
      joinedAt: row.joinedAt,
    }));
  }

  async findActor(tripId: string, userId: string): Promise<TripActor | null> {
    const membership = await this.prisma.tripMembership.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { role: true, status: true },
    });

    if (!membership) return null;

    return { userId, tripId, role: membership.role, status: membership.status };
  }

  async updateRole(tripId: string, userId: string, role: TripRole): Promise<void> {
    await this.prisma.tripMembership.update({
      where: { tripId_userId: { tripId, userId } },
      data: { role },
    });
  }

  async markRemoved(tripId: string, userId: string): Promise<void> {
    // Soft removal only — the row is referenced by expenses and messages.
    await this.prisma.tripMembership.update({
      where: { tripId_userId: { tripId, userId } },
      data: { status: 'REMOVED', removedAt: new Date() },
    });
  }

  /**
   * Ownership transfer, in one transaction.
   *
   * Both writes must land together. A crash after demoting the old owner but
   * before promoting the new one would leave the trip with NO owner — and since
   * only an owner can transfer, that state is unrecoverable through the UI.
   */
  async transferOwnership(tripId: string, fromUserId: string, toUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tripMembership.update({
        where: { tripId_userId: { tripId, userId: fromUserId } },
        // Demoted to ADMIN rather than MEMBER: the former owner keeps the
        // ability to help run the trip, which is almost always the intent.
        data: { role: 'ADMIN' },
      });

      await tx.tripMembership.update({
        where: { tripId_userId: { tripId, userId: toUserId } },
        data: { role: 'OWNER' },
      });
    });
  }
}
