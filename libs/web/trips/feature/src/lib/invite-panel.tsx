'use client';

import { useActionState, useState } from 'react';
import { createInviteAction, type InviteState } from './trips.actions';

const initial: InviteState = { token: null, error: null };

/**
 * Generates and shares an invite link.
 *
 * This is the most important control in the product: a trip with one member has
 * no value, so every bit of friction here costs a participant
 * (docs/prd-review.md §4.8). Hence copy-to-clipboard and a direct WhatsApp
 * hand-off rather than expecting people to select the text themselves.
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
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="border-border rounded-[--radius-card] border p-4">
      <h2 className="font-medium">Invite people</h2>
      <p className="text-text-muted mt-1 text-sm">
        Anyone with the link can join as a member. It expires in 14 days.
      </p>

      {link ? (
        <div className="mt-3 flex flex-col gap-2">
          <code className="border-border bg-surface-muted overflow-x-auto rounded-[--radius-control] border px-3 py-2 text-xs">
            {link}
          </code>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="border-border rounded-[--radius-control] border px-3 py-2 text-sm"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noreferrer"
              className="bg-brand-600 rounded-[--radius-control] px-3 py-2 text-sm font-medium text-white"
            >
              Share on WhatsApp
            </a>
          </div>

          <p className="text-text-muted text-xs">
            Copy it now — for security the link is not stored and cannot be shown again.
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="tripId" value={tripId} />
          <button
            type="submit"
            disabled={pending}
            className="bg-brand-600 rounded-[--radius-control] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? 'Creating…' : 'Create invite link'}
          </button>
        </form>
      )}

      {state.error ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
