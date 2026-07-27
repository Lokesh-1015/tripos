import type { PollKind, PollStatus, PollSubject, RawVote } from '@tripos/api/polls/domain';

export interface PollOptionRecord {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  readonly url: string | null;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly createdById: string;
}

export interface PollRecord {
  readonly id: string;
  readonly tripId: string;
  readonly subject: PollSubject;
  readonly kind: PollKind;
  readonly status: PollStatus;
  readonly question: string;
  readonly closesAt: Date | null;
  readonly allowMemberOptions: boolean;
  readonly decidedOptionId: string | null;
  readonly createdById: string;
  readonly createdAt: Date;
  readonly options: PollOptionRecord[];
  readonly votes: RawVote[];
}

export interface CreatePollInput {
  readonly tripId: string;
  readonly subject: PollSubject;
  readonly kind: PollKind;
  readonly question: string;
  readonly closesAt: Date | null;
  readonly allowMemberOptions: boolean;
  readonly createdById: string;
  readonly options: ReadonlyArray<{
    label: string;
    description: string | null;
    url: string | null;
    startDate: Date | null;
    endDate: Date | null;
  }>;
}

export interface PollRepository {
  /** Creates the poll and its initial options atomically — a poll with no options is unusable. */
  create(input: CreatePollInput): Promise<PollRecord>;

  listForTrip(tripId: string): Promise<PollRecord[]>;

  findById(pollId: string, tripId: string): Promise<PollRecord | null>;

  addOption(
    pollId: string,
    option: {
      label: string;
      description: string | null;
      url: string | null;
      startDate: Date | null;
      endDate: Date | null;
      createdById: string;
    },
  ): Promise<PollOptionRecord>;

  /**
   * Records a vote.
   *
   * For SINGLE_CHOICE the implementation must clear the voter's other votes on
   * the same poll in the SAME transaction — otherwise changing your mind leaves
   * two votes and the tally is wrong. "Change your vote" was a gap the PRD left
   * open (docs/prd-review.md §4.14).
   */
  castVote(pollId: string, optionId: string, userId: string, kind: PollKind): Promise<void>;

  retractVote(pollId: string, optionId: string, userId: string): Promise<void>;

  close(pollId: string, decidedOptionId: string | null): Promise<void>;
}

export const POLL_REPOSITORY = Symbol('POLL_REPOSITORY');
