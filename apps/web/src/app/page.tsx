import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { Button, Card } from '@tripos/shared/ui';
import { redirect } from 'next/navigation';

const PILLARS = [
  {
    icon: '🗳️',
    title: 'Decide together',
    body: 'Vote on dates, destinations and places to eat — the answer stops getting lost in the chat.',
  },
  {
    icon: '💸',
    title: 'Split fairly',
    body: 'Log expenses in any currency and see who owes what, settled with the fewest transfers.',
  },
  {
    icon: '🗺️',
    title: 'Stay organised',
    body: 'One itinerary, one place for tickets and confirmations, one packing list everyone can see.',
  },
];

/**
 * Root route.
 *
 * Signed-in users go straight to their trips; signed-out visitors get the pitch.
 * This is the only genuinely public page and the one place SEO applies
 * (docs/prd-review.md §3.4) — everything else is a private workspace.
 */
export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect('/trips');
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-12 sm:py-20">
      <section className="flex flex-col gap-5">
        <span className="bg-brand-50 text-brand-700 w-fit rounded-[--radius-pill] px-3 py-1 text-xs font-medium">
          For group travel
        </span>

        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.1]">
          Plan the trip,
          <br className="hidden sm:block" /> not the spreadsheet
        </h1>

        <p className="text-text-muted max-w-xl text-base sm:text-lg">
          TripOS keeps a group&apos;s plans, decisions, money and memories in one shared workspace —
          so nothing gets buried in the group chat.
        </p>

        <div className="flex flex-wrap gap-3">
          <SignUpButton>
            <Button>Create your first trip</Button>
          </SignUpButton>
          <SignInButton>
            <Button variant="secondary">Sign in</Button>
          </SignInButton>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {PILLARS.map((pillar) => (
          <Card key={pillar.title} className="p-5">
            <span className="text-2xl" aria-hidden>
              {pillar.icon}
            </span>
            <h2 className="mt-3 font-semibold">{pillar.title}</h2>
            <p className="text-text-muted mt-1.5 text-sm">{pillar.body}</p>
          </Card>
        ))}
      </section>
    </main>
  );
}
