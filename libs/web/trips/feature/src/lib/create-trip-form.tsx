'use client';

import { Alert, Button, Field, Input, Select } from '@tripos/shared/ui';
import { useActionState, useEffect, useState } from 'react';
import { CURRENCIES, DEFAULT_CURRENCY } from './currencies';
import { createTripAction, type ActionState } from './trips.actions';

const initial: ActionState = { error: null };

/**
 * Create-trip form.
 *
 * Mobile-first: one column that stays comfortable at 375px, with native date
 * inputs so phones get a real picker for free (CLAUDE.md §13).
 */
export function CreateTripForm() {
  const [state, formAction, pending] = useActionState(createTripAction, initial);
  const [timezone, setTimezone] = useState('Etc/UTC');

  // Only the browser knows the user's zone. Captured into a hidden field at
  // submit time — every trip needs an IANA zone because itinerary times render
  // in trip-local time (CLAUDE.md §9).
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC');
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="timezone" value={timezone} />

      <Field label="Trip name">
        <Input name="name" required maxLength={120} placeholder="Goa with the gang" />
      </Field>

      <Field label="Destination" hint="Optional — you can decide this together later.">
        <Input name="destination" maxLength={200} placeholder="Goa, India" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <Input type="date" name="startDate" />
        </Field>
        <Field label="Ends">
          <Input type="date" name="endDate" />
        </Field>
      </div>

      <Field
        label="Currency"
        hint="Expenses can be logged in any currency; trip totals are shown in this one."
      >
        <Select name="baseCurrency" defaultValue={DEFAULT_CURRENCY}>
          {CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} · {currency.label} ({currency.symbol})
            </option>
          ))}
        </Select>
      </Field>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create trip'}
      </Button>
    </form>
  );
}
