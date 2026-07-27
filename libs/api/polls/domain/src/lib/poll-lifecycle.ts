export const POLL_SUBJECTS = [
  'DESTINATION',
  'DATES',
  'ACTIVITY',
  'RESTAURANT',
  'ACCOMMODATION',
  'GENERAL',
] as const;

export type PollSubject = (typeof POLL_SUBJECTS)[number];
export type PollKind = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
export type PollStatus = 'OPEN' | 'CLOSED';

export interface PollState {
  readonly status: PollStatus;
  readonly closesAt: Date | null;
}

export type VoteRejection = 'CLOSED' | 'DEADLINE_PASSED';

export type VoteCheck =
  | { readonly canVote: true }
  | { readonly canVote: false; readonly rejection: VoteRejection; readonly reason: string };

/**
 * Whether a poll still accepts votes.
 *
 * The deadline is applied LAZILY here rather than by a scheduled job that flips
 * the status. A scheduler leaves a window — however small — in which a poll is
 * past its deadline but still marked OPEN, and votes cast in that window are
 * indefensible. Deriving it on read means the deadline is exact by construction.
 */
export function checkCanVote(poll: PollState, now: Date): VoteCheck {
  if (poll.status === 'CLOSED') {
    return { canVote: false, rejection: 'CLOSED', reason: 'This poll has been closed' };
  }

  if (poll.closesAt !== null && poll.closesAt.getTime() <= now.getTime()) {
    return {
      canVote: false,
      rejection: 'DEADLINE_PASSED',
      reason: 'Voting on this poll has ended',
    };
  }

  return { canVote: true };
}

/** True when a poll is open to votes right now, deadline included. */
export function isAcceptingVotes(poll: PollState, now: Date): boolean {
  return checkCanVote(poll, now).canVote;
}
