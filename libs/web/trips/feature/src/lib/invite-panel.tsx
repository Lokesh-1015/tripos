'use client';

import { Alert, Button, ButtonLink, Card } from '@tripos/shared/ui';
import { useActionState, useState } from 'react';
import { createInviteAction, type InviteState } from './trips.actions';

const initial: InviteState = { token: null, error: null };

/**
 * Generates and shares an invite link.
 *
 * The most important control in the product: a trip with one member has no
 * value, so every bit of friction here costs a participant
 * (docs/prd-review.md §4.8). Hence copy-to-clipboard and a direct WhatsApp
 * hand-off rather than expecting anyone to select the text themselves.
 */
export function InvitePanel({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [state, formAction, pending] = useActionState(createInviteAction, initial);
  const [copied, setCopied] = useState(false);

  const link = state.token
    ? `${typeof window === 'undefined' ? '' : window.location.origin}/join/${state.token}`
    : null;

  const shareText = `Join our trip "${tripName}" on TripOS: ${link ?? ''}`;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked by permissions; the link is visible and
      // selectable above, so this is a degraded path rather than a failure.
      setCopied(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Invite your group</h2>
          <p className="text-text-muted mt-1 text-sm">
            Anyone with the link joins as a member. It expires in 14 days.
          </p>
        </div>
        <span className="text-2xl" aria-hidden>
          ✈️
        </span>
      </div>

      {link ? (
        <div className="mt-4 flex flex-col gap-3">
          <code className="border-border bg-surface-sunken block overflow-x-auto rounded-[--radius-control] border px-3 py-2.5 font-mono text-xs">
            {link}
          </code>

          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noreferrer"
            >
              Share on WhatsApp
            </ButtonLink>
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? '✓ Copied' : 'Copy link'}
            </Button>
          </div>

          <p className="text-text-subtle text-xs">
            Copy it now — for security the link is stored only as a hash and cannot be shown again.
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-4">
          <input type="hidden" name="tripId" value={tripId} />
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create invite link'}
          </Button>
        </form>
      )}

      {state.error ? (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
    </Card>
  );
}
