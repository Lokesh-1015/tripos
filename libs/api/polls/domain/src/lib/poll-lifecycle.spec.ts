import { describe, expect, it } from 'vitest';
import { checkCanVote, isAcceptingVotes, type PollState } from './poll-lifecycle';

const now = new Date('2026-07-27T12:00:00.000Z');
const minute = 60 * 1000;

const poll = (overrides: Partial<PollState> = {}): PollState => ({
  status: 'OPEN',
  closesAt: null,
  ...overrides,
});

describe('checkCanVote', () => {
  it('accepts an open poll with no deadline', () => {
    expect(checkCanVote(poll(), now).canVote).toBe(true);
  });

  it('accepts an open poll before its deadline', () => {
    expect(checkCanVote(poll({ closesAt: new Date(now.getTime() + minute) }), now).canVote).toBe(
      true,
    );
  });

  it('rejects a closed poll', () => {
    const result = checkCanVote(poll({ status: 'CLOSED' }), now);

    expect(result.canVote).toBe(false);
    if (!result.canVote) expect(result.rejection).toBe('CLOSED');
  });

  it('rejects an OPEN poll whose deadline has passed', () => {
    // The deadline is derived on read rather than flipped by a scheduler, so
    // there is no window in which a late vote can slip in.
    const result = checkCanVote(poll({ closesAt: new Date(now.getTime() - 1) }), now);

    expect(result.canVote).toBe(false);
    if (!result.canVote) expect(result.rejection).toBe('DEADLINE_PASSED');
  });

  it('treats the exact deadline instant as closed', () => {
    expect(checkCanVote(poll({ closesAt: now }), now).canVote).toBe(false);
  });

  it('reports CLOSED ahead of DEADLINE_PASSED when both apply', () => {
    // "The organiser closed this" is more accurate than "voting ended".
    const result = checkCanVote(
      poll({ status: 'CLOSED', closesAt: new Date(now.getTime() - minute) }),
      now,
    );

    if (!result.canVote) expect(result.rejection).toBe('CLOSED');
  });
});

describe('isAcceptingVotes', () => {
  it('mirrors checkCanVote', () => {
    expect(isAcceptingVotes(poll(), now)).toBe(true);
    expect(isAcceptingVotes(poll({ status: 'CLOSED' }), now)).toBe(false);
  });
});
