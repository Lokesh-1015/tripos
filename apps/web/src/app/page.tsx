import { auth } from '@clerk/nextjs/server';
import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

/**
 * Root route.
 *
 * Signed-in users go straight to their trips; signed-out visitors get the pitch.
 * This is the only genuinely public page, and the one place SEO matters
 * (docs/prd-review.md §3.4) — everything else is a private workspace.
 */
export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect('/trips');
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Plan the trip, not the spreadsheet
        </h1>
        <p className="text-text-muted mt-3">
          TripOS keeps a group&apos;s plans, decisions, costs and memories in one place — so the
          details stop getting lost in the chat.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <SignUpButton>
          <button className="bg-brand-600 rounded-[--radius-control] px-4 py-2 font-medium text-white">
            Create your first trip
          </button>
        </SignUpButton>
        <SignInButton>
          <button className="border-border rounded-[--radius-control] border px-4 py-2 font-medium">
            Sign in
          </button>
        </SignInButton>
      </div>
    </main>
  );
}
