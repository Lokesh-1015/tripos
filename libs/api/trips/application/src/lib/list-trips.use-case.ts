import type { TripRepository, TripSummary } from './trip-repository.port';

/**
 * Lists the trips a user belongs to.
 *
 * Scoping is the repository's job and is not optional: `listForUser` takes a
 * userId so that an unscoped "all trips" query is awkward to write by accident
 * (CLAUDE.md §7).
 */
export class ListTripsUseCase {
  constructor(private readonly trips: TripRepository) {}

  async execute(actorUserId: string): Promise<TripSummary[]> {
    return this.trips.listForUser(actorUserId);
  }
}
