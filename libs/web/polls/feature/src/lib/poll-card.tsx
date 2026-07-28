'use client';

import type { PollDto } from '@tripos/shared/contracts';
import { Alert, Badge, Button, Card } from '@tripos/shared/ui';
import { useActionState, useState } from 'react';
import { SUBJECT_META, describeDeadline, optionLabel, sharePercent } from './poll-meta';
import { addOptionAction, closePollAction, initialPollState, voteAction } from './polls.actions';

/**
 * A single poll.
 *
 * Every affordance is driven by the server-supplied `canVote` / `canAddOptions`
 * / `canClose` flags rather than re-derived from role and status. That is what
 * keeps the buttons honest: a control shown here is one the API will actually
 * accept (ADR-0006).
 */
export function PollCard({ poll }: { poll: PollDto }) {
  const meta = SUBJECT_META[poll.subject];
  const [voteState, vote, voting] = useActionState(voteAction, initialPollState);
  const [closeState, close, closing] = useActionState(closePollAction, initialPollState);
  const [optionState, addOption, addingOption] = useActionState(addOptionAction, initialPollState);
  const [showAddOption, setShowAddOption] = useState(false);

  const decided = poll.options.find((option) => option.id === poll.decidedOptionId);
  const isClosed = poll.status === 'CLOSED';

  return (
    <Card className="overflow-hidden">
      <header className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <div className="text-text-subtle flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
            <span aria-hidden>{meta.icon}</span>
            {meta.label}
          </div>
          <h3 className="mt-1 font-semibold leading-snug">{poll.question}</h3>
        </div>

        {isClosed ? (
          <Badge tone="neutral">Closed</Badge>
        ) : poll.kind === 'MULTIPLE_CHOICE' ? (
          <Badge tone="brand">Pick any</Badge>
        ) : (
          <Badge tone="brand">Pick one</Badge>
        )}
      </header>

      {decided ? (
        <p className="bg-positive-soft text-positive flex items-center gap-2 px-5 py-2.5 text-sm font-medium">
          <span aria-hidden>✓</span> Decided: {optionLabel(decided)}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2 px-5 py-4">
        {poll.options.map((option) => {
          const mine = poll.myVotes.includes(option.id);
          const percent = sharePercent(option.votes, poll.voterCount);
          const isDecided = option.id === poll.decidedOptionId;

          return (
            <li key={option.id}>
              <form action={vote}>
                <input type="hidden" name="tripId" value={poll.tripId} />
                <input type="hidden" name="pollId" value={poll.id} />
                <input type="hidden" name="optionId" value={option.id} />
                {/* Tapping your own choice again withdraws it — the same control
                    both ways, so there is no separate "unvote" to hunt for. */}
                <input type="hidden" name="retract" value={mine ? '1' : '0'} />

                <button
                  type="submit"
                  disabled={!poll.canVote || voting}
                  aria-pressed={mine}
                  className={
                    'group relative w-full overflow-hidden rounded-[--radius-control] border px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 ' +
                    'focus-visible:outline-none focus-visible:shadow-[--shadow-focus] ' +
                    'disabled:cursor-default ' +
                    (mine
                      ? 'border-brand-400 bg-brand-50/60 '
                      : 'border-border hover:border-border-strong ') +
                    (isDecided ? 'ring-positive/40 ring-2 ' : '')
                  }
                >
                  {/* Result bar sits behind the label rather than beside it, so
                      the row stays readable at 375px. */}
                  <span
                    aria-hidden
                    className={
                      'absolute inset-y-0 left-0 transition-[width] duration-500 ease-out ' +
                      (mine ? 'bg-brand-100/70' : 'bg-surface-sunken')
                    }
                    style={{ width: `${percent}%` }}
                  />

                  <span className="relative flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className={
                          'flex size-4 shrink-0 items-center justify-center rounded-[--radius-pill] border text-[10px] ' +
                          (mine
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-border-strong')
                        }
                      >
                        {mine ? '✓' : ''}
                      </span>
                      <span className="truncate text-sm font-medium">{optionLabel(option)}</span>
                    </span>

                    <span className="text-text-muted shrink-0 text-xs tabular-nums">
                      {option.votes > 0 ? `${option.votes} · ${percent}%` : '—'}
                    </span>
                  </span>
                </button>
              </form>

              {option.url ? (
                <a
                  href={option.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 mt-1 inline-block px-3 text-xs underline"
                >
                  View details
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>

      <footer className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
        <p className="text-text-subtle text-xs">
          {poll.voterCount === 0
            ? 'No votes yet — be the first'
            : `${poll.voterCount} ${poll.voterCount === 1 ? 'person has' : 'people have'} voted`}
          {poll.closesAt && !isClosed ? ` · ${describeDeadline(poll.closesAt)}` : ''}
          {poll.isTie && !isClosed ? ' · currently tied' : ''}
        </p>

        <div className="flex gap-2">
          {poll.canAddOptions ? (
            <Button variant="ghost" size="sm" onClick={() => setShowAddOption((open) => !open)}>
              {showAddOption ? 'Cancel' : '+ Option'}
            </Button>
          ) : null}

          {poll.canClose ? (
            <form action={close}>
              <input type="hidden" name="tripId" value={poll.tripId} />
              <input type="hidden" name="pollId" value={poll.id} />
              <Button type="submit" variant="secondary" size="sm" disabled={closing}>
                {closing ? 'Closing…' : 'Close & decide'}
              </Button>
            </form>
          ) : null}
        </div>
      </footer>

      {showAddOption ? (
        <form action={addOption} className="border-border flex gap-2 border-t px-5 py-3">
          <input type="hidden" name="tripId" value={poll.tripId} />
          <input type="hidden" name="pollId" value={poll.id} />
          <input
            name="label"
            required
            maxLength={160}
            placeholder={meta.optionPlaceholder || 'Another option'}
            className="border-border bg-surface focus:border-brand-400 w-full rounded-[--radius-control] border px-3 py-2 text-sm focus:outline-none focus:shadow-[--shadow-focus]"
          />
          <Button type="submit" size="sm" disabled={addingOption}>
            Add
          </Button>
        </form>
      ) : null}

      {/*
        A tie is not the user's mistake, so it is not shown as an error. The card
        switches into "pick the winner" mode — which is the only thing that can
        resolve it, and matches the API refusing to guess.
      */}
      {closeState.needsTieBreak ? (
        <div className="bg-warning-soft border-border border-t px-5 py-4">
          <p className="text-sm font-medium">It&apos;s a tie — which one wins?</p>
          <p className="text-text-muted mt-1 text-xs">
            Someone has to make the call. Pick an option to record it as the decision.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {poll.options
              .filter((option) => option.isLeading)
              .map((option) => (
                <form key={option.id} action={close}>
                  <input type="hidden" name="tripId" value={poll.tripId} />
                  <input type="hidden" name="pollId" value={poll.id} />
                  <input type="hidden" name="optionId" value={option.id} />
                  <Button type="submit" size="sm" disabled={closing}>
                    {optionLabel(option)}
                  </Button>
                </form>
              ))}
          </div>
        </div>
      ) : null}

      {voteState.error || closeState.error || optionState.error ? (
        <div className="px-5 pb-4">
          <Alert>{voteState.error ?? closeState.error ?? optionState.error}</Alert>
        </div>
      ) : null}
    </Card>
  );
}
