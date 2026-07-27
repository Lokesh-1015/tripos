import { BadRequestException, Controller, NotFoundException, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '@tripos/api/shared/auth';
import { RequiresTripRole, TripAccessGuard } from '@tripos/api/shared/trip-access';
import {
  CreateInviteUseCase,
  CreateTripUseCase,
  InvalidInviteError,
  InvalidTripDatesError,
  ListTripsUseCase,
  type TripSummary,
} from '@tripos/api/trips/application';
import { contract, type TripSummaryDto } from '@tripos/shared/contracts';
import { Implement, implement } from '@orpc/nest';

/** Dates are stored date-only; the contract renders them as `YYYY-MM-DD`. */
function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toDto(trip: TripSummary): TripSummaryDto {
  return {
    ...trip,
    startDate: toDateOnly(trip.startDate),
    endDate: toDateOnly(trip.endDate),
  };
}

/**
 * Trip routes.
 *
 * Note what is NOT here: no permission logic. `TripAccessGuard` plus
 * `@RequiresTripRole` answer "may this person touch this trip", and the policies
 * in `api/shared/authz` answer the fine-grained questions. A controller
 * containing an `if` about business rules is a bug (CLAUDE.md §4).
 */
@Controller()
export class TripsController {
  constructor(
    private readonly createTrip: CreateTripUseCase,
    private readonly listTrips: ListTripsUseCase,
    private readonly createInvite: CreateInviteUseCase,
  ) {}

  /**
   * Creating a trip is not trip-scoped — there is no trip to be a member of yet,
   * so only authentication applies. The creator becomes OWNER atomically.
   */
  @Implement(contract.trips.create)
  create(@CurrentUser() user: AuthenticatedUser) {
    return implement(contract.trips.create).handler(async ({ input }) => {
      try {
        const trip = await this.createTrip.execute({
          name: input.name,
          destination: input.destination ?? null,
          timezone: input.timezone,
          baseCurrency: input.baseCurrency,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          actorUserId: user.userId,
        });

        return toDto(trip);
      } catch (error) {
        if (error instanceof InvalidTripDatesError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
    });
  }

  @Implement(contract.trips.list)
  list(@CurrentUser() user: AuthenticatedUser) {
    return implement(contract.trips.list).handler(async () => {
      const trips = await this.listTrips.execute(user.userId);

      return { trips: trips.map(toDto) };
    });
  }

  @Implement(contract.trips.get)
  @UseGuards(TripAccessGuard)
  @RequiresTripRole('VIEWER')
  get(@CurrentUser() user: AuthenticatedUser) {
    return implement(contract.trips.get).handler(async ({ input }) => {
      const trip = await this.listTrips
        .execute(user.userId)
        .then((trips) => trips.find((t) => t.id === input.tripId));

      // The guard already proved membership, so this is a genuine miss.
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }

      return toDto(trip);
    });
  }

  /**
   * Issuing an invite requires ADMIN. The raw token is returned exactly once —
   * it is not recoverable afterwards, because only its hash is stored.
   */
  @Implement(contract.trips.createInvite)
  @UseGuards(TripAccessGuard)
  @RequiresTripRole('ADMIN')
  invite(@CurrentUser() user: AuthenticatedUser) {
    return implement(contract.trips.createInvite).handler(async ({ input }) => {
      try {
        const invite = await this.createInvite.execute({
          tripId: input.tripId,
          role: input.role,
          email: input.email ?? null,
          maxUses: input.maxUses ?? null,
          actorUserId: user.userId,
        });

        return {
          id: invite.id,
          token: invite.token,
          expiresAt: invite.expiresAt.toISOString(),
        };
      } catch (error) {
        if (error instanceof InvalidInviteError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
    });
  }
}
