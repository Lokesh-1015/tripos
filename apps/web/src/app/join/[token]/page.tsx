import { acceptInvite } from '@tripos/web/trips/data-access';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/**
 * The invite landing page — the most conversion-sensitive screen in the product.
 *
 * An invited person arrives here from a WhatsApp message, and a trip with one
 * member has no value (docs/prd-review.md §4.8). So:
 *
 *  - A signed-out visitor is sent to sign-up with a redirect back to THIS url,
 *    so the token survives the round trip and they land straight in the trip.
 *  - Success redirects immediately into the trip rather than showing an
 *    interstitial to dismiss.
 *  - Failures explain which failure it was, because "expired" and "revoked" have
 *    different remedies — ask for a new link, versus ask to be re-added.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { userId } = await auth();

  if (!userId) {
    // Preserve the invite through sign-up: Clerk returns here afterwards.
    redirect(`/sign-up?redirect_url=${encodeURIComponent(`/join/${token}`)}`);
  }

  let failure: string | null = null;

  try {
    const result = await acceptInvite(token);

    // Joined, or already a member — both mean "you're in", so both go to the
    // trip. Treating a double-tap as an error would be a needless dead end.
    redirect(`/trips/${result.tripId}`);
  } catch (cause) {
    // `redirect()` throws by design; let that propagate.
    if (cause instanceof Error && cause.message === 'NEXT_REDIRECT') {
      throw cause;
    }

    failure = cause instanceof Error ? cause.message : 'This invite link is not valid';
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">We couldn&apos;t add you to this trip</h1>
      <p role="alert" className="text-text-muted text-sm">
        {failure}
      </p>
      <p className="text-text-muted text-sm">Ask whoever invited you to send a fresh link.</p>
      <Link
        href="/trips"
        className="bg-brand-600 rounded-[--radius-control] px-4 py-2 text-sm font-medium text-white"
      >
        Go to your trips
      </Link>
    </main>
  );
}
