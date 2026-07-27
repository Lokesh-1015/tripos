import type { CreateTripInput, TripRepository, TripSummary } from './trip-repository.port';

export interface CreateTripCommand {
  readonly name: string;
  readonly destination?: string | null;
  readonly timezone: string;
  readonly baseCurrency: string;
  readonly startDate?: Date | null;
  readonly endDate?: Date | null;
  readonly actorUserId: string;
}

export class InvalidTripDatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTripDatesError';
  }
}

/**
 * Creates a trip, with the creator as its OWNER.
 *
 * There is no "trip without an owner" state: the repository performs both writes
 * in one transaction, because a trip whose creator has no membership row would
 * be invisible and unmanageable — nobody could invite to it, edit it, or delete
 * it (ADR-0006).
 */
export class CreateTripUseCase {
  constructor(private readonly trips: TripRepository) {}

  async execute(command: CreateTripCommand): Promise<TripSummary> {
    const name = command.name.trim();
    if (name.length === 0) {
      throw new InvalidTripDatesError('A trip needs a name');
    }

    const startDate = command.startDate ?? null;
    const endDate = command.endDate ?? null;

    // Caught here rather than at the database: an end before a start silently
    // breaks every date-range query and the itinerary UI downstream.
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new InvalidTripDatesError('A trip cannot end before it starts');
    }

    const input: CreateTripInput = {
      name,
      destination: command.destination?.trim() || null,
      timezone: command.timezone,
      baseCurrency: command.baseCurrency.toUpperCase(),
      startDate,
      endDate,
      createdById: command.actorUserId,
    };

    return this.trips.createWithOwner(input);
  }
}
