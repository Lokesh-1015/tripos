import { auth } from '@clerk/nextjs/server';
import { Alert, Badge, PageHeader } from '@tripos/shared/ui';
import { listPolls } from '@tripos/web/polls/data-access';
import { PollsSection } from '@tripos/web/polls/feature';
import { listMembers, listMyTrips } from '@tripos/web/trips/data-access';
import { InvitePanel, MembersPanel } from '@tripos/web/trips/feature';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

const STATUS_TONE = {
  DRAFT: 'neutral',
  PLANNING: 'brand',
  ACTIVE: 'positive',
  COMPLETED: 'neutral',
  ARCHIVED: 'neutral',
} as const;

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    redirect('/sign-in');
  }

  const { tripId } = await params;
  const trips = await listMyTrips();
  const trip = trips.find((candidate) => candidate.id === tripId);

  // The API returns 403 for a trip you are not a member of; here it simply is
  // not in the caller's list.
  if (!trip) {
    notFound();
  }

  // Fetched in parallel: they are independent, and serialising them would add a
  // round trip to every page load for no reason.
  const [membersResult, pollsResult] = await Promise.allSettled([
    listMembers(trip.id),
    listPolls(trip.id),
  ]);

  const members = membersResult.status === 'fulfilled' ? membersResult.value : [];
  const membersError =
    membersResult.status === 'rejected'
      ? membersResult.reason instanceof Error
        ? membersResult.reason.message
        : 'Could not load members'
      : null;

  // One section failing must not blank the others — allSettled keeps the page
  // useful when a single call is unhappy.
  const polls = pollsResult.status === 'fulfilled' ? pollsResult.value : [];

  const canInvite = trip.myRole === 'OWNER' || trip.myRole === 'ADMIN';

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div>
        <Link href="/trips" className="text-text-muted hover:text-text text-sm">
          ← All trips
        </Link>

        <div className="mt-3">
          <PageHeader
            title={trip.name}
            subtitle={trip.destination ?? 'Destination to be decided'}
            actions={<Badge tone={STATUS_TONE[trip.status]}>{trip.status.toLowerCase()}</Badge>}
          />
        </div>

        <div className="text-text-subtle mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span>
            {trip.startDate ? `${trip.startDate}` : 'Dates not set'}
            {trip.endDate && trip.endDate !== trip.startDate ? ` → ${trip.endDate}` : ''}
          </span>
          <span aria-hidden>·</span>
          <span>{trip.baseCurrency}</span>
          <span aria-hidden>·</span>
          <span>{trip.timezone}</span>
        </div>
      </div>

      <PollsSection tripId={trip.id} polls={polls} />

      {canInvite ? <InvitePanel tripId={trip.id} tripName={trip.name} /> : null}

      {membersError ? (
        <Alert>{membersError}</Alert>
      ) : (
        <MembersPanel trip={trip} members={members} currentUserId={trip.myUserId} />
      )}
    </main>
  );
}
