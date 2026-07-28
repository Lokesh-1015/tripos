'use client';

import type { PollDto } from '@tripos/shared/contracts';
import { Alert, Button, Card, Field, Input } from '@tripos/shared/ui';
import { useActionState, useState } from 'react';
import { SUBJECT_META } from './poll-meta';
import { createPollAction, initialPollState } from './polls.actions';

const SUBJECTS: PollDto['subject'][] = [
  'DESTINATION',
  'DATES',
  'ACTIVITY',
  'RESTAURANT',
  'ACCOMMODATION',
  'GENERAL',
];

/**
 * Create-poll form.
 *
 * The subject picker is where "one primitive, five features" becomes visible to
 * the user: choosing DATES swaps the option rows for date pickers, everything
 * else stays identical. Two option rows are shown from the start because two is
 * the minimum a poll accepts — asking someone to press "add" twice before they
 * can submit is a pointless step.
 */
export function CreatePollForm({ tripId }: { tripId: string }) {
  const [state, formAction, pending] = useActionState(createPollAction, initialPollState);
  const [subject, setSubject] = useState<PollDto['subject']>('DESTINATION');
  const [optionCount, setOptionCount] = useState(2);
  const [open, setOpen] = useState(false);

  const meta = SUBJECT_META[subject];
  const rows = Array.from({ length: optionCount }, (_, index) => index);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + New poll
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Ask the group</h3>
          <p className="text-text-muted mt-1 text-sm">
            Settle it with a vote instead of forty messages.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="subject" value={subject} />

        <fieldset>
          <legend className="text-sm font-medium">What kind of decision?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUBJECTS.map((candidate) => {
              const candidateMeta = SUBJECT_META[candidate];
              const selected = candidate === subject;

              return (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setSubject(candidate)}
                  aria-pressed={selected}
                  className={
                    'inline-flex items-center gap-1.5 rounded-[--radius-pill] border px-3 py-1.5 text-sm transition-colors duration-150 ' +
                    'focus-visible:outline-none focus-visible:shadow-[--shadow-focus] ' +
                    (selected
                      ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                      : 'border-border hover:border-border-strong')
                  }
                >
                  <span aria-hidden>{candidateMeta.icon}</span>
                  {candidateMeta.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="Question">
          <Input name="question" required maxLength={300} placeholder={meta.questionPlaceholder} />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Options</legend>

          {rows.map((index) =>
            meta.usesDateRange ? (
              <div key={index} className="flex items-center gap-2">
                <Input type="date" name="optionStart" aria-label={`Option ${index + 1} start`} />
                <span className="text-text-subtle text-sm" aria-hidden>
                  →
                </span>
                <Input type="date" name="optionEnd" aria-label={`Option ${index + 1} end`} />
              </div>
            ) : (
              <Input
                key={index}
                name="option"
                maxLength={160}
                aria-label={`Option ${index + 1}`}
                placeholder={index === 0 ? meta.optionPlaceholder : 'Another option'}
              />
            ),
          )}

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOptionCount((count) => count + 1)}
            >
              + Add another
            </Button>
          </div>
        </fieldset>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="kind"
            value="MULTIPLE_CHOICE"
            className="accent-brand-600 mt-0.5 size-4"
          />
          <span>
            <span className="font-medium">Let people pick several</span>
            <span className="text-text-muted block text-xs">
              Good for &ldquo;which of these would you be happy with?&rdquo; — usually finds an
              answer everyone can live with.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="allowMemberOptions"
            defaultChecked
            className="accent-brand-600 mt-0.5 size-4"
          />
          <span>
            <span className="font-medium">Let anyone add options</span>
            <span className="text-text-muted block text-xs">
              Others can suggest choices you didn&apos;t think of.
            </span>
          </span>
        </label>

        {state.error ? <Alert>{state.error}</Alert> : null}

        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Start the vote'}
        </Button>
      </form>
    </Card>
  );
}
