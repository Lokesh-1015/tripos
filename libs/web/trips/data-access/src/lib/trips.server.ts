import type { TripSummaryDto } from '@tripos/shared/contracts';
import { createServerApiClient } from '@tripos/web/shared/data-access';

/**
 * Server-side trip reads and writes.
 *
 * Every call is typed from the shared contract, so a change to the API shape
 * fails this file at compile time rather than at runtime in a user's browser
 * (ADR-0004, ADR-0009).
 */

export async function listMyTrips(): Promise<TripSummaryDto[]> {
  const api = await createServerApiClient();
  const { trips } = await api.trips.list();

  return trips;
}

export interface CreateTripFields {
  name: string;
  destination: string | null;
  timezone: string;
  baseCurrency: string;
  startDate: string | null;
  endDate: string | null;
}

export async function createTrip(fields: CreateTripFields): Promise<TripSummaryDto> {
  const api = await createServerApiClient();

  return api.trips.create(fields);
}

export interface CreatedInviteLink {
  token: string;
  expiresAt: string;
}

export async function createInviteLink(tripId: string): Promise<CreatedInviteLink> {
  const api = await createServerApiClient();
  const invite = await api.trips.createInvite({ tripId, role: 'MEMBER' });

  // The raw token is only ever available here, in this response — it is not
  // stored and cannot be re-read later.
  return { token: invite.token, expiresAt: invite.expiresAt };
}

export async function acceptInvite(token: string) {
  const api = await createServerApiClient();

  return api.trips.acceptInvite({ token });
}
