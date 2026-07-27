import { Global, Module } from '@nestjs/common';
import { PRISMA, PrismaModule } from '@tripos/api/shared/database';
import type { PrismaClient } from '@tripos/shared/database';
import { PrismaTripMembershipReader } from './prisma-trip-membership.reader';
import { TripAccessGuard } from './trip-access.guard';
import { TRIP_MEMBERSHIP_READER } from './trip-membership.reader';

/**
 * Provides `TripAccessGuard` and its membership reader.
 *
 * Global because every trip-scoped domain module needs the guard, and requiring
 * each to import it invites someone to forget — with an authorization guard, a
 * forgotten import is a security hole rather than a compile error.
 *
 * The guard itself is NOT registered globally: it must be applied per controller
 * alongside `@RequiresTripRole`, since only trip-scoped routes have a trip to
 * check.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: TRIP_MEMBERSHIP_READER,
      useFactory: (prisma: PrismaClient) => new PrismaTripMembershipReader(prisma),
      inject: [PRISMA],
    },
    TripAccessGuard,
  ],
  exports: [TripAccessGuard, TRIP_MEMBERSHIP_READER],
})
export class TripAccessModule {}
