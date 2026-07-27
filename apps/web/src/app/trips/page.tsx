import { Alert, Card, EmptyState, PageHeader } from '@tripos/shared/ui';
import { listMyTrips } from '@tripos/web/trips/data-access';
import { CreateTripForm, TripList } from '@tripos/web/trips/feature';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

/**
 * The trips dashboard — the authenticated home of the product.
 *
 * A Server Component, so the list is fetched with the caller's Clerk token
 * server-side and no API token ever reaches the browser (CLAUDE.md §13).
 */
export default async function TripsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  let trips: Awaited<ReturnType<typeof listMyTrips>> = [];
  let error: string | null = null;

  try {
    trips = await listMyTrips();
  } catch (cause) {
    // A failing API must not blank the page — the create form still works, so
    // the user can act rather than being stuck.
    error = cause instanceof Error ? cause.message : 'Could not load your trips';
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:py-12">
      <PageHeader
        title="Your trips"
        subtitle="Plan together, split the costs, and keep everything in one place."
      />

      {error ? (
        <Alert>{error}</Alert>
      ) : trips.length === 0 ? (
        <EmptyState
          icon="🧳"
          title="No trips yet"
          description="Create your first trip below, then send the link to everyone coming along."
        />
      ) : (
        <TripList trips={trips} />
      )}

      <section>
        <h2 className="text-lg font-semibold">Start a new trip</h2>
        <Card className="mt-3 p-5">
          <CreateTripForm />
        </Card>
      </section>
    </main>
  );
}
