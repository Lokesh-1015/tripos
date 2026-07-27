import { listMyTrips } from '@tripos/web/trips/data-access';
import { CreateTripForm, TripList } from '@tripos/web/trips/feature';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

/**
 * The trips dashboard — the authenticated home of the product.
 *
 * A Server Component, so the trip list is fetched with the caller's Clerk token
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
    // A failing API must not blank the page — show the create form regardless,
    // so the user can still act.
    error = cause instanceof Error ? cause.message : 'Could not load your trips';
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Your trips</h1>
        <p className="text-text-muted mt-1 text-sm">
          Plan together, split costs, and keep everything in one place.
        </p>

        <div className="mt-4">
          {error ? (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          ) : (
            <TripList trips={trips} />
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">New trip</h2>
        <div className="mt-3">
          <CreateTripForm />
        </div>
      </section>
    </main>
  );
}
