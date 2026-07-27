import type { CreateTripInput, TripRepository, TripSummary } from '@tripos/api/trips/application';
import type { PrismaClient } from '@tripos/shared/database';

/**
 * Prisma implementation of `TripRepository`.
 *
 * Framework-free, as with every adapter here — the composition root supplies the
 * client, which is what keeps it usable from scripts and workers.
 */
export class PrismaTripRepository implements TripRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates the trip and its owner membership in ONE transaction.
   *
   * Not two writes: a trip whose creator has no membership row would be
   * invisible to every query (they all scope by membership) and unmanageable —
   * nobody could invite to it, edit it, or delete it. A crash between the two
   * writes would leave exactly that orphan, so the database guarantees both or
   * neither.
   */
  async createWithOwner(input: CreateTripInput): Promise<TripSummary> {
    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          name: input.name,
          destination: input.destination,
          timezone: input.timezone,
          baseCurrency: input.baseCurrency,
          startDate: input.startDate,
          endDate: input.endDate,
          createdById: input.createdById,
          memberships: {
            create: {
              userId: input.createdById,
              role: 'OWNER',
              status: 'ACTIVE',
            },
          },
        },
        select: {
          id: true,
          name: true,
          destination: true,
          timezone: true,
          baseCurrency: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      });

      return { ...trip, memberCount: 1, myRole: 'OWNER' as const };
    });
  }

  async listForUser(userId: string): Promise<TripSummary[]> {
    // Scoped by membership, never "all trips" — the query shape itself is the
    // access control (CLAUDE.md §7).
    const memberships = await this.prisma.tripMembership.findMany({
      where: { userId, status: 'ACTIVE', trip: { deletedAt: null } },
      select: {
        role: true,
        trip: {
          select: {
            id: true,
            name: true,
            destination: true,
            timezone: true,
            baseCurrency: true,
            startDate: true,
            endDate: true,
            status: true,
            _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
      orderBy: { trip: { startDate: 'asc' } },
    });

    return memberships.map(({ role, trip }) => ({
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      timezone: trip.timezone,
      baseCurrency: trip.baseCurrency,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      memberCount: trip._count.memberships,
      myRole: role,
    }));
  }

  async findByIdForUser(tripId: string, userId: string): Promise<TripSummary | null> {
    const membership = await this.prisma.tripMembership.findUnique({
      where: { tripId_userId: { tripId, userId }, status: 'ACTIVE' },
      select: {
        role: true,
        trip: {
          select: {
            id: true,
            name: true,
            destination: true,
            timezone: true,
            baseCurrency: true,
            startDate: true,
            endDate: true,
            status: true,
            deletedAt: true,
            _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
    });

    if (!membership || membership.trip.deletedAt !== null) {
      return null;
    }

    const { trip } = membership;

    return {
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      timezone: trip.timezone,
      baseCurrency: trip.baseCurrency,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      memberCount: trip._count.memberships,
      myRole: membership.role,
    };
  }
}
