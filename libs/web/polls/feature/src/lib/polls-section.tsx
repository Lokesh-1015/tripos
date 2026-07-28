import type { PollDto } from '@tripos/shared/contracts';
import { EmptyState } from '@tripos/shared/ui';
import { CreatePollForm } from './create-poll-form';
import { PollCard } from './poll-card';

/**
 * The decisions section of a trip.
 *
 * Open polls come first: a closed poll is a record, an open one is a request for
 * your attention, and the thing needing action should not sit below the archive.
 */
export function PollsSection({ tripId, polls }: { tripId: string; polls: PollDto[] }) {
  const open = polls.filter((poll) => poll.status === 'OPEN');
  const closed = polls.filter((poll) => poll.status === 'CLOSED');

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Decisions</h2>
          <p className="text-text-muted mt-0.5 text-sm">
            Where, when, and what — settled by the group.
          </p>
        </div>
        <CreatePollForm tripId={tripId} />
      </div>

      {polls.length === 0 ? (
        <EmptyState
          icon="🗳️"
          title="Nothing to decide yet"
          description="Start a vote on where to go, which dates suit everyone, or where to eat — and stop the answer getting lost in the chat."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {open.map((poll) => (
            <PollCard key={poll.id} poll={poll} />
          ))}

          {closed.length > 0 ? (
            <>
              <p className="text-text-subtle mt-2 text-xs font-medium uppercase tracking-wide">
                Settled
              </p>
              {closed.map((poll) => (
                <PollCard key={poll.id} poll={poll} />
              ))}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
