'use client';

import { useActionState, useEffect, useState } from 'react';
import { createTripAction, type ActionState } from './trips.actions';

const initial: ActionState = { error: null };

/**
 * Create-trip form.
 *
 * Mobile-first: a single column that stays usable at 375px, since most of this
 * product is used on a phone (CLAUDE.md §13). The date inputs are native, which
 * gives a real date picker on mobile for free.
 */
export function CreateTripForm() {
  const [state, formAction, pending] = useActionState(createTripAction, initial);
  const [timezone, setTimezone] = useState('Etc/UTC');

  // Resolved on the client because only the browser knows the user's zone.
  // Captured at submit time via a hidden field.
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC');
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="timezone" value={timezone} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Trip name</span>
        <input
          name="name"
          required
          maxLength={120}
          placeholder="Goa with the gang"
          className="border-border rounded-[--radius-control] border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Destination</span>
        <input
          name="destination"
          maxLength={200}
          placeholder="Goa, India"
          className="border-border rounded-[--radius-control] border px-3 py-2"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Start</span>
          <input
            type="date"
            name="startDate"
            className="border-border rounded-[--radius-control] border px-3 py-2"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">End</span>
          <input
            type="date"
            name="endDate"
            className="border-border rounded-[--radius-control] border px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Currency</span>
        <input
          name="baseCurrency"
          defaultValue="INR"
          maxLength={3}
          className="border-border w-28 rounded-[--radius-control] border px-3 py-2 uppercase"
        />
        <span className="text-text-muted text-xs">
          Expenses can be in any currency; totals are shown in this one.
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand-600 rounded-[--radius-control] px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create trip'}
      </button>
    </form>
  );
}
