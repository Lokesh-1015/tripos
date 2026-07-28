import type { TripActor } from '@tripos/api/shared/authz';
import { hasAtLeastRole } from '@tripos/api/shared/authz';
import {
  checkCanVote,
  resolveWinner,
  tallyVotes,
  type PollKind,
  type PollSubject,
  type Tally,
} from '@tripos/api/polls/domain';
import type { PollRecord, PollRepository } from './poll-repository.port';

export class PollNotFoundError extends Error {
  constructor() {
    super('Poll not found');
    this.name = 'PollNotFoundError';
  }
}

export class PollActionDeniedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PollActionDeniedError';
  }
}

export class InvalidPollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPollError';
  }
}

export interface PollView extends PollRecord {
  readonly tally: Tally;
  /** Option ids the requesting user has voted for. */
  readonly myVotes: string[];
  readonly isAcceptingVotes: boolean;

  /**
   * What THIS caller may do, decided by the same rules the write paths enforce.
   *
   * Returned rather than left for the client to infer: a UI that re-derives
   * "can I close this?" from role and status is a second copy of the policy,
   * and the two drift. The server already knows the answer.
   */
  readonly canVote: boolean;
  readonly canAddOptions: boolean;
  readonly canClose: boolean;
}

/** Mirrors CastVoteUseCase's checks exactly — see the note on PollView. */
function computeCanVote(poll: PollRecord, actor: TripActor, now: Date): boolean {
  return hasAtLeastRole(actor.role, 'MEMBER') && checkCanVote(poll, now).canVote;
}

/** Mirrors AddPollOptionUseCase's checks. */
function computeCanAddOptions(poll: PollRecord, actor: TripActor): boolean {
  if (poll.status === 'CLOSED') return false;
  if (!hasAtLeastRole(actor.role, 'MEMBER')) return false;

  return poll.allowMemberOptions || hasAtLeastRole(actor.role, 'ADMIN');
}

/** Mirrors ClosePollUseCase's checks. */
function computeCanClose(poll: PollRecord, actor: TripActor): boolean {
  if (poll.status === 'CLOSED') return false;

  return hasAtLeastRole(actor.role, 'ADMIN') || poll.createdById === actor.userId;
}

function toView(poll: PollRecord, actor: TripActor, now: Date): PollView {
  return {
    ...poll,
    tally: tallyVotes(
      poll.options.map((option) => option.id),
      poll.votes,
    ),
    myVotes: poll.votes.filter((vote) => vote.userId === actor.userId).map((vote) => vote.optionId),
    isAcceptingVotes: checkCanVote(poll, now).canVote,
    canVote: computeCanVote(poll, actor, now),
    canAddOptions: computeCanAddOptions(poll, actor),
    canClose: computeCanClose(poll, actor),
  };
}

export interface CreatePollCommand {
  readonly tripId: string;
  readonly subject: PollSubject;
  readonly kind: PollKind;
  readonly question: string;
  readonly closesAt: Date | null;
  readonly allowMemberOptions: boolean;
  readonly options: ReadonlyArray<{
    label: string;
    description?: string | null;
    url?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
  }>;
  readonly actor: TripActor;
}

export class CreatePollUseCase {
  constructor(
    private readonly polls: PollRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Returns a full view rather than the bare record.
   *
   * The controller previously assembled an empty tally by hand and asserted
   * `isAcceptingVotes: true`. That happened to be correct, but it was an
   * assertion about state rather than a reading of it — exactly the kind of
   * thing that silently becomes a lie when the rules change.
   */
  async execute(command: CreatePollCommand): Promise<PollView> {
    const question = command.question.trim();
    if (question.length === 0) {
      throw new InvalidPollError('A poll needs a question');
    }

    // Two options is the minimum that constitutes a choice. One option is an
    // announcement, and voting on it tells the group nothing.
    if (command.options.length < 2) {
      throw new InvalidPollError('A poll needs at least two options');
    }

    if (command.closesAt && command.closesAt.getTime() <= this.now().getTime()) {
      throw new InvalidPollError('A poll deadline must be in the future');
    }

    const created = await this.polls.create({
      tripId: command.tripId,
      subject: command.subject,
      kind: command.kind,
      question,
      closesAt: command.closesAt,
      allowMemberOptions: command.allowMemberOptions,
      createdById: command.actor.userId,
      options: command.options.map((option) => ({
        label: option.label.trim(),
        description: option.description?.trim() || null,
        url: option.url?.trim() || null,
        startDate: option.startDate ?? null,
        endDate: option.endDate ?? null,
      })),
    });

    return toView(created, command.actor, this.now());
  }
}

export class ListPollsUseCase {
  constructor(
    private readonly polls: PollRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: TripActor): Promise<PollView[]> {
    const polls = await this.polls.listForTrip(actor.tripId);

    return polls.map((poll) => toView(poll, actor, this.now()));
  }
}

export class CastVoteUseCase {
  constructor(
    private readonly polls: PollRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: TripActor, pollId: string, optionId: string): Promise<PollView> {
    const poll = await this.requirePoll(pollId, actor.tripId);

    // VIEWERs read everything and change nothing — voting is a change.
    if (!hasAtLeastRole(actor.role, 'MEMBER')) {
      throw new PollActionDeniedError('Viewers cannot vote');
    }

    const votable = checkCanVote(poll, this.now());
    if (!votable.canVote) {
      throw new PollActionDeniedError(votable.reason);
    }

    if (!poll.options.some((option) => option.id === optionId)) {
      throw new InvalidPollError('That option is not part of this poll');
    }

    // For SINGLE_CHOICE the repository clears the voter's other votes in the
    // same transaction, which is what makes changing your mind work.
    await this.polls.castVote(pollId, optionId, actor.userId, poll.kind);

    return this.reload(pollId, actor);
  }

  private async requirePoll(pollId: string, tripId: string): Promise<PollRecord> {
    const poll = await this.polls.findById(pollId, tripId);
    if (!poll) throw new PollNotFoundError();
    return poll;
  }

  private async reload(pollId: string, actor: TripActor): Promise<PollView> {
    const poll = await this.requirePoll(pollId, actor.tripId);
    return toView(poll, actor, this.now());
  }
}

export class RetractVoteUseCase {
  constructor(
    private readonly polls: PollRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: TripActor, pollId: string, optionId: string): Promise<PollView> {
    const poll = await this.polls.findById(pollId, actor.tripId);
    if (!poll) throw new PollNotFoundError();

    const votable = checkCanVote(poll, this.now());
    if (!votable.canVote) {
      throw new PollActionDeniedError(votable.reason);
    }

    await this.polls.retractVote(pollId, optionId, actor.userId);

    const reloaded = await this.polls.findById(pollId, actor.tripId);
    if (!reloaded) throw new PollNotFoundError();

    return toView(reloaded, actor, this.now());
  }
}

export class AddPollOptionUseCase {
  constructor(private readonly polls: PollRepository) {}

  async execute(
    actor: TripActor,
    pollId: string,
    option: {
      label: string;
      description?: string | null;
      url?: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
    },
  ): Promise<void> {
    const poll = await this.polls.findById(pollId, actor.tripId);
    if (!poll) throw new PollNotFoundError();

    if (poll.status === 'CLOSED') {
      throw new PollActionDeniedError('This poll has been closed');
    }

    // Members may add options only when the organiser allowed it; admins always
    // can, since they own the poll's shape.
    const isOrganiser = hasAtLeastRole(actor.role, 'ADMIN');
    if (!isOrganiser && !poll.allowMemberOptions) {
      throw new PollActionDeniedError('Only the organiser can add options to this poll');
    }
    if (!hasAtLeastRole(actor.role, 'MEMBER')) {
      throw new PollActionDeniedError('Viewers cannot add options');
    }

    const label = option.label.trim();
    if (label.length === 0) {
      throw new InvalidPollError('An option needs a label');
    }

    await this.polls.addOption(pollId, {
      label,
      description: option.description?.trim() || null,
      url: option.url?.trim() || null,
      startDate: option.startDate ?? null,
      endDate: option.endDate ?? null,
      createdById: actor.userId,
    });
  }
}

/**
 * Closes a poll and records the decision.
 *
 * The decision is the point: closing without recording an outcome would leave
 * the group exactly where they started. When the result is tied, this refuses to
 * guess and asks for an explicit choice (see `resolveWinner`).
 */
export class ClosePollUseCase {
  constructor(private readonly polls: PollRepository) {}

  async execute(actor: TripActor, pollId: string, explicitOptionId?: string | null): Promise<void> {
    const poll = await this.polls.findById(pollId, actor.tripId);
    if (!poll) throw new PollNotFoundError();

    // Closing is a decision on the group's behalf: admins, or whoever opened it.
    const isOrganiser = hasAtLeastRole(actor.role, 'ADMIN');
    if (!isOrganiser && poll.createdById !== actor.userId) {
      throw new PollActionDeniedError('Only an organiser or the poll’s author can close it');
    }

    if (poll.status === 'CLOSED') {
      // Idempotent — closing twice is not an error.
      return;
    }

    let decidedOptionId: string | null = null;

    if (explicitOptionId) {
      if (!poll.options.some((option) => option.id === explicitOptionId)) {
        throw new InvalidPollError('That option is not part of this poll');
      }
      decidedOptionId = explicitOptionId;
    } else {
      const tally = tallyVotes(
        poll.options.map((option) => option.id),
        poll.votes,
      );

      // Throws on a tie or on no votes; both need a human, not a default.
      decidedOptionId = resolveWinner(tally);
    }

    await this.polls.close(pollId, decidedOptionId);
  }
}
