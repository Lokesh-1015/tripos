import { Module } from '@nestjs/common';
import { PRISMA, PrismaModule } from '@tripos/api/shared/database';
import {
  AcceptInviteUseCase,
  CreateInviteUseCase,
  CreateTripUseCase,
  ListTripsUseCase,
  TRIP_INVITE_REPOSITORY,
  TRIP_REPOSITORY,
  type TripInviteRepository,
  type TripRepository,
} from '@tripos/api/trips/application';
import { PrismaTripInviteRepository, PrismaTripRepository } from '@tripos/api/trips/infrastructure';
import type { PrismaClient } from '@tripos/shared/database';
import { InvitesController } from './invites.controller';
import { TripsController } from './trips.controller';

/**
 * The trips module — composition root for this domain.
 *
 * Binding each port to its adapter is the only job done here, and the only place
 * that knows both sides exist. Use cases receive interfaces, so they stay
 * testable without a database and the module stays extractable (ADR-0001).
 */
@Module({
  imports: [PrismaModule],
  controllers: [TripsController, InvitesController],
  providers: [
    {
      provide: TRIP_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaTripRepository(prisma),
      inject: [PRISMA],
    },
    {
      provide: TRIP_INVITE_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaTripInviteRepository(prisma),
      inject: [PRISMA],
    },
    {
      provide: CreateTripUseCase,
      useFactory: (trips: TripRepository) => new CreateTripUseCase(trips),
      inject: [TRIP_REPOSITORY],
    },
    {
      provide: ListTripsUseCase,
      useFactory: (trips: TripRepository) => new ListTripsUseCase(trips),
      inject: [TRIP_REPOSITORY],
    },
    {
      provide: CreateInviteUseCase,
      useFactory: (invites: TripInviteRepository) => new CreateInviteUseCase(invites),
      inject: [TRIP_INVITE_REPOSITORY],
    },
    {
      provide: AcceptInviteUseCase,
      useFactory: (invites: TripInviteRepository) => new AcceptInviteUseCase(invites),
      inject: [TRIP_INVITE_REPOSITORY],
    },
  ],
})
export class TripsModule {}
