'use client';

import type { TripMemberDto, TripSummaryDto } from '@tripos/shared/contracts';
import { Alert, Badge, Button, Card } from '@tripos/shared/ui';
import { useActionState } from 'react';
import { memberAction, type ActionState } from './trips.actions';

const initial: ActionState = { error: null };

const ROLE_TONE = {
  OWNER: 'brand',
  ADMIN: 'brand',
  MEMBER: 'neutral',
  VIEWER: 'neutral',
} as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Trip members, with the actions the viewer is actually allowed to take.
 *
 * The buttons shown here mirror the server-side policies, but they are a
 * CONVENIENCE, not the enforcement — every action is re-checked by the policy
 * layer on the API. Hiding a button the user could not use is good UX; relying
 * on that to keep them out would be a security hole (ADR-0006).
 */
export function MembersPanel({
  trip,
  members,
  currentUserId,
}: {
  trip: TripSummaryDto;
  members: TripMemberDto[];
  currentUserId: string;
}) {
  const [state, formAction, pending] = useActionState(memberAction, initial);

  const isOwner = trip.myRole === 'OWNER';
  const isAdmin = isOwner || trip.myRole === 'ADMIN';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">
          Members <span className="text-text-subtle font-normal">({members.length})</span>
        </h2>
      </div>

      {state.error ? (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}

      <ul className="divide-border mt-3 divide-y">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const canManage = isAdmin && !isSelf && member.role !== 'OWNER';

          return (
            <li key={member.userId} className="flex items-center gap-3 py-3">
              <span className="bg-brand-100 text-brand-700 flex size-9 shrink-0 items-center justify-center rounded-[--radius-pill] text-xs font-semibold">
                {initials(member.displayName)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.displayName}
                  {isSelf ? <span className="text-text-subtle font-normal"> · you</span> : null}
                </p>
                <p className="text-text-subtle truncate text-xs">{member.email}</p>
              </div>

              <Badge tone={ROLE_TONE[member.role]}>{member.role.toLowerCase()}</Badge>

              {canManage || (isSelf && !isOwner) ? (
                <form action={formAction} className="flex shrink-0 gap-1">
                  <input type="hidden" name="tripId" value={trip.id} />
                  <input type="hidden" name="userId" value={member.userId} />

                  {isSelf ? (
                    <Button
                      type="submit"
                      name="intent"
                      value="leave"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                    >
                      Leave
                    </Button>
                  ) : (
                    <>
                      {isOwner ? (
                        <Button
                          type="submit"
                          name="intent"
                          value={member.role === 'ADMIN' ? 'demote' : 'promote'}
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                        >
                          {member.role === 'ADMIN' ? 'Make member' : 'Make admin'}
                        </Button>
                      ) : null}
                      <Button
                        type="submit"
                        name="intent"
                        value="remove"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>

      {isOwner ? (
        <p className="text-text-subtle mt-3 text-xs">
          You own this trip, so you can&apos;t leave it — transfer ownership to someone else first.
        </p>
      ) : null}
    </Card>
  );
}
