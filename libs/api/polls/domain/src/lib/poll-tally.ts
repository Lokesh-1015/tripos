export interface RawVote {
  readonly optionId: string;
  readonly userId: string;
}

export interface OptionTally {
  readonly optionId: string;
  readonly votes: number;
  /** True when this option is among the joint leaders. */
  readonly isLeading: boolean;
}

export interface Tally {
  readonly perOption: OptionTally[];
  /** Distinct people who voted, not vote count — approval voting inflates the latter. */
  readonly voterCount: number;
  readonly totalVotes: number;
  /** Joint leaders. More than one means a tie; empty means nobody voted. */
  readonly leaders: string[];
  readonly isTie: boolean;
}

/**
 * Counts a poll.
 *
 * Pure, so the most argued-over numbers in the product can be tested
 * exhaustively without a database. Two details that matter:
 *
 *  - Options with zero votes are still returned. Dropping them would make the
 *    UI silently lose choices nobody picked, which is information.
 *  - `voterCount` counts distinct people. Under approval voting one person can
 *    cast several votes, so vote count is not turnout, and reporting it as such
 *    would misrepresent participation.
 */
export function tallyVotes(optionIds: readonly string[], votes: readonly RawVote[]): Tally {
  const counts = new Map<string, number>();
  for (const optionId of optionIds) {
    counts.set(optionId, 0);
  }

  const voters = new Set<string>();
  let totalVotes = 0;

  for (const vote of votes) {
    // Ignore votes for options that no longer exist — an option can be deleted
    // while a stale client still holds its id.
    if (!counts.has(vote.optionId)) continue;

    counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
    voters.add(vote.userId);
    totalVotes += 1;
  }

  const highest = Math.max(0, ...counts.values());
  const leaders =
    highest === 0 ? [] : [...counts.entries()].filter(([, n]) => n === highest).map(([id]) => id);

  return {
    perOption: optionIds.map((optionId) => ({
      optionId,
      votes: counts.get(optionId) ?? 0,
      isLeading: highest > 0 && counts.get(optionId) === highest,
    })),
    voterCount: voters.size,
    totalVotes,
    leaders,
    isTie: leaders.length > 1,
  };
}

export class AmbiguousPollOutcomeError extends Error {
  constructor(readonly leaders: string[]) {
    super('This poll is tied — choose the winning option explicitly to close it');
    this.name = 'AmbiguousPollOutcomeError';
  }
}

export class NoVotesError extends Error {
  constructor() {
    super('Nobody has voted, so there is no outcome to record');
    this.name = 'NoVotesError';
  }
}

/**
 * The option a poll should record as its decision.
 *
 * Refuses to guess. A tie is resolved by a person, not by whichever row the
 * database happened to return first — silently picking one would record a group
 * decision nobody made, which is exactly the kind of thing that erodes trust in
 * a shared tool.
 */
export function resolveWinner(tally: Tally): string {
  if (tally.leaders.length === 0) {
    throw new NoVotesError();
  }

  if (tally.isTie) {
    throw new AmbiguousPollOutcomeError(tally.leaders);
  }

  const [winner] = tally.leaders;
  if (!winner) {
    throw new NoVotesError();
  }

  return winner;
}
