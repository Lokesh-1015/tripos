'use server';

import {
  changeMemberRole,
  createInviteLink,
  createTrip,
  leaveTrip,
  removeMember,
  transferOwnership,
} from '@tripos/web/trips/data-access';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export interface ActionState {
  error: string | null;
}

/**
 * Server Action for creating a trip.
 *
 * The form posts here rather than to a client-side fetch, so the Clerk session
 * is read server-side and no token is exposed to the browser.
 */
export async function createTripAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get('name') ?? '').trim();

  if (name.length === 0) {
    return { error: 'Give your trip a name' };
  }

  const optional = (key: string): string | null => {
    const value = String(formData.get(key) ?? '').trim();
    return value.length > 0 ? value : null;
  };

  const startDate = optional('startDate');
  const endDate = optional('endDate');

  // Mirrored server-side by the use case, but catching it here means the user
  // sees the problem next to the field rather than as a 400.
  if (startDate && endDate && endDate < startDate) {
    return { error: 'The end date cannot be before the start date' };
  }

  try {
    await createTrip({
      name,
      destination: optional('destination'),
      // The browser's zone, captured by the form. Every trip needs an IANA zone
      // because itinerary times render in trip-local time (CLAUDE.md §9).
      timezone: optional('timezone') ?? 'Etc/UTC',
      baseCurrency: optional('baseCurrency') ?? 'INR',
      startDate,
      endDate,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create the trip' };
  }

  revalidatePath('/trips');

  return { error: null };
}

/**
 * Member actions.
 *
 * Each returns the policy's own message on failure — "transfer ownership before
 * leaving this trip" is actionable in a way that "Forbidden" is not.
 */
export async function memberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = String(formData.get('tripId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const intent = String(formData.get('intent') ?? '');

  if (!tripId) {
    return { error: 'Missing trip' };
  }

  try {
    switch (intent) {
      case 'remove':
        await removeMember(tripId, userId);
        break;
      case 'promote':
        await changeMemberRole(tripId, userId, 'ADMIN');
        break;
      case 'demote':
        await changeMemberRole(tripId, userId, 'MEMBER');
        break;
      case 'transfer':
        await transferOwnership(tripId, userId);
        break;
      case 'leave':
        await leaveTrip(tripId);
        break;
      default:
        return { error: 'Unknown action' };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'That action failed' };
  }

  if (intent === 'leave') {
    // No longer a member — the trip page would 403, so go back to the list.
    redirect('/trips');
  }

  revalidatePath(`/trips/${tripId}`);

  return { error: null };
}

export interface InviteState {
  token: string | null;
  error: string | null;
}

export async function createInviteAction(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const tripId = String(formData.get('tripId') ?? '');

  if (!tripId) {
    return { token: null, error: 'Missing trip' };
  }

  try {
    const invite = await createInviteLink(tripId);

    return { token: invite.token, error: null };
  } catch (error) {
    return {
      token: null,
      error: error instanceof Error ? error.message : 'Could not create an invite link',
    };
  }
}
