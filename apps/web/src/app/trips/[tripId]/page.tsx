import { listMyTrips } from '@tripos/web/trips/data-access';
import { InvitePanel } from '@tripos/web/trips/feature';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

/**
 * Trip detail.
 *
 * M1 shows identity and invites; itinerary, expenses, and members arrive in
 * later milestones. The invite panel is here because inviting is the action that
 * matters most right now — a trip with one member has no value.
 */
export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const { tripId } = await params;
  const trips = await listMyTrips();
  const trip = trips.find((candidate) => candidate.id === tripId);

  // The API would return 403 for a trip you are not a member of; here we simply
  // have no such trip in the caller's list.
  if (!trip) {
    notFound();
  }

  const canInvite = trip.myRole === 'OWNER' || trip.myRole === 'ADMIN';

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/trips" className="text-text-muted text-sm">
          ← All trips
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{trip.name}</h1>
        <p className="text-text-muted mt-1 text-sm">
          {trip.destination ?? 'Destination not set'}
          {trip.startDate ? ` · ${trip.startDate}` : ''}
          {trip.endDate && trip.endDate !== trip.startDate ? ` → ${trip.endDate}` : ''}
        </p>
        <p className="text-text-muted mt-1 text-xs">
          {trip.memberCount} {trip.memberCount === 1 ? 'member' : 'members'} ·{' '}
          {trip.status.toLowerCase()} · {trip.baseCurrency}
        </p>
      </div>

      {canInvite ? (
        <InvitePanel tripId={trip.id} tripName={trip.name} />
      ) : (
        <p className="text-text-muted text-sm">
          Only the organiser can invite people to this trip.
        </p>
      )}
    </main>
  );
}
